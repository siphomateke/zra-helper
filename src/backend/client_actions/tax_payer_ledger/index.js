import { getPagedData, parallelTaskMap, taskFunction } from '@/backend/client_actions/utils';
import { taxTypes } from '@/backend/constants';
import { getTaxPayerLedgerPage } from '@/backend/reports';
import { getAccountCodeTask } from '@/backend/tax_account_code';
import store from '@/store';
import createTask from '@/transitional/tasks';
import { createClientAction, ClientActionRunner } from '../base';

const TaxPayerLedgerClientAction = createClientAction({
  id: 'taxPayerLedger',
  name: 'Get tax payer ledger',
  requiresTaxTypes: true,
});

TaxPayerLedgerClientAction.Runner = class extends ClientActionRunner {
  constructor(data) {
    super(data);
    this.storeProxy.actionId = TaxPayerLedgerClientAction.id;
    this.records = [];
  }

  async runInternal() {
    const { parentTask, client } = this.storeProxy;

    // FIXME: Use proper dates
    const fromDate = '01/01/2013';
    const toDate = '11/03/2019';

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
            });

            const task = await createTask(store, {
              title: 'Extract data from all pages of ledger',
              parent: taxAccountTask.id,
            });

            const getPageSubTask = (page, subTaskParentId) => ({
              title: `Extract data from page ${page + 1} of the ledger`,
              parent: subTaskParentId,
              indeterminate: true,
            });

            taxAccountTask.status = 'Get data from all pages';
            const allResponses = await getPagedData({
              task,
              getPageSubTask,
              getDataFunction: page => getTaxPayerLedgerPage({
                accountCode,
                fromDate,
                toDate,
                page,
                tpin: client.username,
              }),
            });

            const records = [];
            for (const response of Object.values(allResponses)) {
              for (const record of response.parsedTable.records) {
                records.push(record);
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
