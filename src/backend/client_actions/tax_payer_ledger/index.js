import { getPagedData, parallelTaskMap, taskFunction } from '@/backend/client_actions/utils';
import { taxTypes } from '@/backend/constants';
import { getTaxPayerLedgerPage } from '@/backend/reports';
import getAccountCodeTask from '@/backend/tax_account_code';
import store from '@/store';
import createTask from '@/transitional/tasks';
import { createClientAction, ClientActionRunner } from '../base';
import moment from 'moment';

/**
 * @typedef {Object} RunnerInput
 * @property {import('@/backend/constants').Date} [fromDate]
 * @property {import('@/backend/constants').Date} [toDate]
 */

const TaxPayerLedgerClientAction = createClientAction({
  id: 'taxPayerLedger',
  name: 'Get records from tax payer ledger',
  requiresTaxTypes: true,
  defaultInput: () => ({
    fromDate: '01/01/2013',
    toDate: moment().format('DD/MM/YYYY'),
  }),
});

/**
 * @typedef {Object.<string, import('@/backend/reports').TaxPayerLedgerRecord[]>} LedgerOutput
 * Ledger records by tax type ID
 */

TaxPayerLedgerClientAction.Runner = class extends ClientActionRunner {
  constructor(data) {
    super(data, TaxPayerLedgerClientAction);
  }

  async runInternal() {
    const { task: parentTask, client } = this.storeProxy;
    /** @type {{input: RunnerInput}} */
    const { input } = this.storeProxy;
    const { fromDate, toDate } = input;

    // Get data for each tax account
    const recordsResponses = await parallelTaskMap({
      task: parentTask,
      list: client.registeredTaxAccounts,
      /**
       * @param {import('../utils').TaxAccount} taxAccount
       */
      async func(taxAccount, parentTaskId) {
        const { taxTypeId } = taxAccount;
        const taxTypeCode = taxTypes[taxTypeId];
        const taxAccountTask = await createTask(store, {
          title: `Get ${taxTypeCode} tax payer ledger`,
          parent: parentTaskId,
        });
        return taskFunction({
          task: taxAccountTask,
          async func() {
            taxAccountTask.status = 'Get tax account code';
            const accountCode = await getAccountCodeTask({
              parentTaskId: taxAccountTask.id,
              accountName: taxAccount.accountName,
              taxTypeId,
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

            /** @type {import('@/backend/reports').TaxPayerLedgerRecord[]} */
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

    const output = {};
    for (const recordsResponse of recordsResponses) {
      output[recordsResponse.item.taxTypeId] = recordsResponse.value;
    }
    this.storeProxy.output = output;
  }
};
export default TaxPayerLedgerClientAction;
