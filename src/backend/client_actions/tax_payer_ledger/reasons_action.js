// import moment from 'moment';
import taxPayerLedgerLogic from './logic';
import { ClientActionRunner, createClientAction } from '../base';
import { taskFunction, parallelTaskMap } from '../utils';
import createTask from '@/transitional/tasks';
import { taxTypes } from '@/backend/constants';
import store from '@/store';

/* eslint-disable max-len */
/**
 * @typedef {Object} RunnerInput
 * @property {import('@/backend/client_actions/pending_liabilities').ParsedPendingLiabilitiesOutput[]} lastPendingLiabilities
 */
/* eslint-enable max-len */

const PendingLiabilityChangeReasonsClientAction = createClientAction({
  id: 'pendingLiabilityChangeReasons',
  name: 'Get reasons for pending liabilities',
  requiresTaxTypes: true,
  requiredActions: ['getAllPendingLiabilities', 'taxPayerLedger'],
  defaultInput: () => ({}),
});

PendingLiabilityChangeReasonsClientAction.Runner = class extends ClientActionRunner {
  constructor(data) {
    super(data, PendingLiabilityChangeReasonsClientAction);
    this.records = [];
  }

  getLastPendingLiabilities() {
    /** @type {{input: RunnerInput, client: import('@/backend/constants').Client}} */
    const { client, input } = this.storeProxy;
    const match = input.lastPendingLiabilities.find(item => item.client === client.name);
    if (match) {
      return match.totals;
    }
    return null;
  }

  async runInternal() {
    const { task: parentTask, client } = this.storeProxy;
    // FIXME: Set ledger action dates
    // We have to get all records in case a transaction recently references a very old one.
    /* const fromDate = '01/01/2013';
    const toDate = moment().format('DD/MM/YYYY'); */

    const lastPendingLiabilityTotals = this.getLastPendingLiabilities();
    /** @type {import('../pending_liabilities').ParsedPendingLiabilitiesOutput} */
    const pendingLiabilitiesOutput = this.getActionOutput('getAllPendingLiabilities');
    /** @type {import('./index').LedgerOutput} */
    const recordsByTaxTypeId = this.getActionOutput('taxPayerLedger');

    const output = {};

    // Run on each tax account
    await parallelTaskMap({
      task: parentTask,
      list: client.registeredTaxAccounts,
      /**
       * @param {import('../utils').TaxAccount} taxAccount
       */
      async func(taxAccount, parentTaskId) {
        const { taxTypeId } = taxAccount;
        const taxTypeCode = taxTypes[taxTypeId];
        const taxAccountTask = await createTask(store, {
          title: `Find reasons for ${taxTypeCode} pending liability change`,
          parent: parentTaskId,
        });
        return taskFunction({
          task: taxAccountTask,
          async func() {
            // TODO: Update task status based on logic progress
            const reasonsResponse = await taxPayerLedgerLogic({
              client,
              parentTaskId,
              taxTypeId,
              lastPendingLiabilityTotals: lastPendingLiabilityTotals[taxTypeCode],
              pendingLiabilityTotals: pendingLiabilitiesOutput.totals[taxTypeCode],
              taxPayerLedgerRecords: recordsByTaxTypeId[taxTypeId],
            });

            output[taxTypeId] = reasonsResponse;
          },
        });
      },
    });

    this.storeProxy.output = output;
  }
};
export default PendingLiabilityChangeReasonsClientAction;
