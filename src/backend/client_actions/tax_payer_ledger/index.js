import {
  getPagedData, parallelTaskMap, taskFunction, getClientIdentifier,
} from '@/backend/client_actions/utils';
import { taxTypes, exportFormatCodes } from '@/backend/constants';
import { getTaxPayerLedgerPage, ledgerColumns } from '@/backend/reports';
import getAccountCodeTask from '@/backend/tax_account_code';
import store from '@/store';
import createTask from '@/transitional/tasks';
import {
  createClientAction,
  ClientActionRunner,
  createOutputFile,
  inInput,
} from '../base';
import moment from 'moment';
import { unparseCsv, writeJson } from '@/backend/file_utils';

/**
 * @typedef {Object} RunnerInput
 * @property {import('@/backend/constants').Date} [fromDate]
 * @property {import('@/backend/constants').Date} [toDate]
 * @property {import('@/backend/constants').TaxTypeNumericalCode[]} [taxTypeIds]
 * @property {Object.<string, number[]>} [pages]
 * Pages, stored by tax type ID, to get ledger records from.
 */

function outputFormatter({ output, format }) {
  if (format === exportFormatCodes.CSV) {
    const rows = [];
    const headers = ['taxTypeId', ...ledgerColumns];
    rows.push(headers);

    if (output !== null) {
      // TODO: Indicate output errors
      const numberOfColumns = headers.length;
      for (const taxTypeId of Object.keys(output)) {
        let i = 0;
        const records = output[taxTypeId];
        for (const record of records) {
          let firstCol = '';
          if (i === 0) {
            firstCol = taxTypeId;
          }
          const row = [firstCol];
          for (const col of ledgerColumns) {
            row.push(record[col]);
          }
          // Fill empty columns
          while (row.length < numberOfColumns) {
            row.push('');
          }
          rows.push(row);
          i++;
        }
      }
    }
    // TODO: Make output options configurable by user
    return unparseCsv(rows);
  }
  return writeJson(output);
}

function sanitizeDates(date) {
  return date.replace(/\//g, '-');
}

const TaxPayerLedgerClientAction = createClientAction({
  id: 'taxPayerLedger',
  name: 'Get records from tax payer ledger',
  requiresTaxTypes: true,
  defaultInput: () => ({
    fromDate: '01/01/2013',
    toDate: moment().format('DD/MM/YYYY'),
    taxTypeIds: Object.keys(taxTypes),
  }),
  hasOutput: true,
  generateOutputFiles({ clients, outputs }) {
    const outputFiles = [];
    for (const client of clients) {
      if (!(client.id in outputs)) break;
      const output = outputs[client.id];
      /** @type {{input: RunnerInput}} */
      const { input } = output;
      const period = `${sanitizeDates(input.fromDate)}_${sanitizeDates(input.toDate)}`;
      const filename = `ledger_${client.username}_${period}`;
      /** @type {LedgerOutput | null} */
      const outputValue = output.value;
      outputFiles.push(createOutputFile({
        label: `${getClientIdentifier(client)} ledger records`,
        filename,
        formats: [exportFormatCodes.CSV, exportFormatCodes.JSON],
        value: outputValue,
        formatter: outputFormatter,
      }));
    }
    return createOutputFile({
      label: 'Ledger records for each client',
      wrapper: true,
      children: outputFiles,
    });
  },
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

    let taxAccounts = client.registeredTaxAccounts;

    if (inInput(input, 'taxTypeIds')) {
      taxAccounts = taxAccounts.filter(account => input.taxTypeIds.includes(account.taxTypeId));
    }

    // Get data for each tax account
    const taxTypeResponses = await parallelTaskMap({
      task: parentTask,
      list: taxAccounts,
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

            let pages = [];
            if (inInput(input, 'pages') && taxTypeId in input.pages) {
              pages = input.pages[taxTypeId];
            }

            taxAccountTask.status = 'Get data from all pages';
            const allResponses = await getPagedData({
              task,
              getPageSubTask,
              pages,
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

            return allResponses;
          },
        });
      },
    });

    const output = {};
    const failures = {
      /** @type {import('@/backend/constants').TaxTypeNumericalCode[]} */
      taxTypeIds: [],
      /** @type { Object.<string, number[]>} Failed pages by tax type ID */
      pages: {},
    };
    for (const taxTypeResponse of taxTypeResponses) {
      const { taxTypeId } = taxTypeResponse.item;
      if (!('error' in taxTypeResponse)) {
        /** @type {import('@/backend/reports').TaxPayerLedgerRecord[]} */
        const records = [];
        for (const response of Object.values(taxTypeResponse.value)) {
          if (!('error' in response)) {
            records.push(...response.value.records);
          } else {
            if (!(taxTypeId in failures.pages)) {
              failures.pages[taxTypeId] = [];
            }
            failures.pages[taxTypeId].push(response.page);
          }
        }
        if (taxTypeId in failures.pages) {
          failures.taxTypeIds.push(taxTypeId);
        }
        output[taxTypeId] = records;
      } else {
        failures.taxTypeIds.push(taxTypeId);
      }
    }
    const somePagesFailed = Object.keys(failures.pages).length > 0;
    if (failures.taxTypeIds.length > 0 || somePagesFailed) {
      /** @type {RunnerInput} */
      const retryInput = {};
      if (failures.taxTypeIds.length > 0) {
        retryInput.taxTypeIds = failures.taxTypeIds;
      }
      if (somePagesFailed) {
        retryInput.pages = failures.pages;
      }
      const failedTaxTypes = failures.taxTypeIds.map(id => taxTypes[id]);
      this.setRetryReason(`Failed to get some ledger records from the following tax accounts: [ ${failedTaxTypes.join(', ')} ].`);
      this.storeProxy.retryInput = retryInput;
    }
    // FIXME: Merge records from retry with previous try
    this.storeProxy.output = output;
  }
};
export default TaxPayerLedgerClientAction;
