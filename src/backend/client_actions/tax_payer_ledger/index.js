import {
  getPagedData, parallelTaskMap, taskFunction, getClientIdentifier,
} from '@/backend/client_actions/utils';
import { taxTypes, exportFormatCodes } from '@/backend/constants';
import { getTaxPayerLedgerPage, ledgerColumns } from '@/backend/reports';
import getAccountCodeTask from '@/backend/tax_account_code';
import store from '@/store';
import createTask from '@/transitional/tasks';
import { createClientAction, ClientActionRunner, createOutputFile } from '../base';
import moment from 'moment';
import { unparseCsv, writeJson } from '@/backend/file_utils';

/**
 * @typedef {Object} RunnerInput
 * @property {import('@/backend/constants').Date} [fromDate]
 * @property {import('@/backend/constants').Date} [toDate]
 */

function outputFormatter({ output, format }) {
  if (format === exportFormatCodes.CSV) {
    const rows = [];
    const headers = ['taxTypeId', ...ledgerColumns];
    rows.push(headers);

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
      if (outputValue !== null) {
        outputFiles.push(createOutputFile({
          label: `${getClientIdentifier(client)} ledger records`,
          filename,
          formats: [exportFormatCodes.CSV, exportFormatCodes.JSON],
          value: outputValue,
          formatter: outputFormatter,
        }));
      }
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
