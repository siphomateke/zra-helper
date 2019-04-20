import { getPagedData, parallelTaskMap, taskFunction } from '@/backend/client_actions/utils';
import { taxTypes } from '@/backend/constants';
import { getTaxPayerLedgerPage } from '@/backend/reports';
import getAccountCodeTask from '@/backend/tax_account_code';
import store from '@/store';
import createTask from '@/transitional/tasks';
import { createClientAction, ClientActionRunner } from '../base';

/* eslint-disable max-len */
/**
 * @typedef {Object} RunnerInput
 * @property {import('@/backend/constants').Date} [fromDate]
 * @property {import('@/backend/constants').Date} [toDate]
 * @property {import('@/backend/client_actions/pending_liabilities').ParsedPendingLiabilitiesOutput[]} lastPendingLiabilities
 */
/* eslint-enable max-len */

const TaxPayerLedgerClientAction = createClientAction({
  id: 'taxPayerLedger',
  name: 'Get tax payer ledger',
  requiresTaxTypes: true,
  // FIXME: Use proper dates
  defaultInput: () => ({
    fromDate: '01/01/2013',
    toDate: '11/03/2019',
  }),
});

TaxPayerLedgerClientAction.Runner = class extends ClientActionRunner {
  constructor(data) {
    super(data, TaxPayerLedgerClientAction);
    this.records = [];
  }

  async runInternal() {
    const { task: parentTask, client } = this.storeProxy;
    /** @type {{input: RunnerInput}} */
    const { input } = this.storeProxy;
    const { fromDate, toDate } = input;

    // Get data for each tax account
    this.records = await parallelTaskMap({
      task: parentTask,
      list: client.registeredTaxAccounts,
      /**
       * @param {import('../utils').TaxAccount} taxAccount
       */
      async func(taxAccount, parentTaskId) {
        const taxAccountTask = await createTask(store, {
          title: `Get ${taxTypes[taxAccount.taxTypeId]} tax payer ledger`,
          parent: parentTaskId,
        });
        return taskFunction({
          task: taxAccountTask,
          async func() {
            taxAccountTask.status = 'Get tax account code';
            const accountCode = await getAccountCodeTask({
              parentTaskId: taxAccountTask.id,
              accountName: taxAccount.accountName,
              taxTypeId: taxAccount.taxTypeId,
            });

            const task = await createTask(store, {
              title: 'Extract data from all pages of ledger',
              parent: taxAccountTask.id,
            });

            const getPageSubTask = (page, subTaskParentId) => ({
              title: `Extract data from page ${page} of the ledger`,
              parent: subTaskParentId,
              indeterminate: true,
            });

            taxAccountTask.status = 'Get data from all pages';
            const allResponses = await getPagedData({
              task,
              getPageSubTask,
              getDataFunction: async (page) => {
                const reportPage = await getTaxPayerLedgerPage({
                  accountCode,
                  fromDate,
                  toDate,
                  page,
                  tpin: client.username,
                });
                return {
                  numPages: reportPage.numPages,
                  value: reportPage.parsedTable,
                };
              },
            });

            const records = [];
            for (const response of Object.values(allResponses)) {
              if (!('error' in response)) {
                for (const record of response.value.records) {
                  records.push(record);
                }
              }
            }

            return records;
          },
        });
      },
    });
  }
};
export default TaxPayerLedgerClientAction;
