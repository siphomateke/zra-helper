import store from '@/store';
import createTask from '@/transitional/tasks';
import Papa from 'papaparse';
import { exportFormatCodes, taxTypes } from '../constants';
import { writeJson } from '../file_utils';
import { taskFunction, parallelTaskMap, getClientIdentifier } from './utils';
import { createClientAction, ClientActionRunner } from './base';
import { getPendingLiabilityPage } from '../reports';
import { getAccountCodeTask } from '../tax_account_code';

/** Columns to get from the pending liabilities table */
const totalsColumns = [
  'principal',
  'interest',
  'penalty',
  'total',
];

/**
 * @typedef {Object.<string, string>} Totals
 * Totals with two decimal places. The possible totals are all the items in `totalsColumns`.
 */

/**
 * Generates an object with totals that are all one value.
 * @param {string[]} columns
 * @param {string} value
 * @returns {Totals}
 */
function generateTotals(columns, value) {
  const totals = {};
  for (const column of columns) {
    totals[column] = value;
  }
  return totals;
}

/**
 * Gets the pending liability totals of a tax type.
 * @param {import('../constants').Client} client
 * @param {import('./utils').TaxAccount} taxAccount
 * @param {number} parentTaskId
 * @returns {Promise<Totals|null>}
 */
async function getPendingLiabilities(client, taxAccount, parentTaskId) {
  const taxType = taxTypes[taxAccount.taxTypeId];

  const taxAccountTask = await createTask(store, {
    title: `Get ${taxType} totals`,
    parent: parentTaskId,
    progressMax: 2,
  });
  return taskFunction({
    task: taxAccountTask,
    async func() {
      taxAccountTask.status = 'Getting tax account code';
      const accountCode = await getAccountCodeTask({
        parentTaskId: taxAccountTask.id,
        accountName: taxAccount.accountName,
      });

      taxAccountTask.addStep('Extracting totals');
      const task = await createTask(store, {
        title: 'Extract totals',
        parent: taxAccountTask.id,
        progressMax: 2,
      });
      return taskFunction({
        task,
        async func() {
          task.status = 'Getting totals from first page';
          let response = await getPendingLiabilityPage({
            accountCode,
            taxTypeId: taxAccount.taxTypeId,
            page: 1,
            tpin: client.username,
          });

          if (response.numPages > 1) {
            task.addStep('More than one page found. Getting totals from last page');
            response = await getPendingLiabilityPage({
              accountCode,
              taxTypeId: taxAccount.taxTypeId,
              page: response.numPages,
              tpin: client.username,
            });
          }

          let totals;
          const { records } = response.parsedTable;
          if (records.length > 0) {
            const totalsRow = records[records.length - 1];
            // Make sure we are getting totals from the grand total row.
            if (totalsRow.srNo.toLowerCase() === 'grand total') {
              totals = {};
              for (const column of totalsColumns) {
                const cell = totalsRow[column];
                totals[column] = cell.replace(/\n\n/g, '');
              }
            } else {
              totals = null;
            }
          } else {
            totals = generateTotals(totalsColumns, '0');
          }

          return totals;
        },
      });
    },
  });
}

const GetAllPendingLiabilitiesClientAction = createClientAction({
  id: 'getAllPendingLiabilities',
  name: 'Get all pending liabilities',
  requiresTaxTypes: true,
  hasOutput: true,
  defaultOutputFormat: exportFormatCodes.CSV,
  outputFormats: [exportFormatCodes.CSV, exportFormatCodes.JSON],
  outputFormatter({
    clients,
    outputs: clientOutputs,
    format,
    anonymizeClients,
  }) {
    if (format === exportFormatCodes.CSV) {
      const rows = [];
      const columnOrder = totalsColumns;
      // Columns are: client identifier, ...totals, error
      const numberOfColumns = 2 + totalsColumns.length + 1;
      for (const client of clients) {
        let value = null;
        if (client.id in clientOutputs) {
          ({ value } = clientOutputs[client.id]);
        }
        const totalsObjects = value ? value.totals : null;
        let i = 0;
        for (const taxType of Object.values(taxTypes)) {
          let firstCol = '';
          if (i === 0) {
            firstCol = getClientIdentifier(client, anonymizeClients);
          }
          const row = [firstCol, taxType];
          if (value && (taxType in totalsObjects)) {
            const totalsObject = totalsObjects[taxType];
            const totals = [];
            for (const column of columnOrder) {
              totals.push(totalsObject[column]);
            }
            row.push(...totals);
          } else {
            for (let j = 0; j < columnOrder.length; j++) {
              row.push('');
            }
            // Indicate that this tax type had an error
            if (value && (taxType in value.retrievalErrors)) {
              row.push('!');
            }
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
      return Papa.unparse(rows, {
        quotes: true,
      });
    }
    const json = {};
    for (const client of clients) {
      if (client.id in clientOutputs) {
        const output = clientOutputs[client.id];
        let jsonClient = { id: client.id };
        if (!anonymizeClients) {
          jsonClient = Object.assign(jsonClient, {
            name: client.name,
            username: client.username,
          });
        }
        json[client.id] = {
          client: jsonClient,
          actionId: output.actionId,
          value: output.value,
          error: output.error,
        };
      }
    }
    return writeJson(json);
  },
});

/**
 * @typedef {Object} RunnerInput
 * @property {import('../constants').TaxTypeNumericalCode[]} [taxTypeIds]
 * @property {string[]} [taxAccountNames]
 */

GetAllPendingLiabilitiesClientAction.Runner = class extends ClientActionRunner {
  constructor(data) {
    super(data);
    this.storeProxy.actionId = GetAllPendingLiabilitiesClientAction.id;
  }

  async runInternal() {
    const { task: actionTask, client } = this.storeProxy;
    // eslint-disable-next-line prefer-destructuring
    const input = /** @type {RunnerInput} */(this.storeProxy.input);
    let taxAccounts = client.registeredTaxAccounts;

    if (input) {
      if ('taxTypeIds' in input) {
        taxAccounts = taxAccounts.filter(account => input.taxTypeIds.includes(account.taxTypeId));
      }
      if ('taxAccountNames' in input) {
        const names = input.taxAccountNames;
        taxAccounts = taxAccounts.filter(account => names.includes(account.accountName));
      }
    }

    const responses = await parallelTaskMap({
      task: actionTask,
      count: taxAccounts.length,
      async func(taxAccountKey, parentTaskId) {
        const taxAccount = taxAccounts[taxAccountKey];
        return getPendingLiabilities(client, taxAccount, parentTaskId);
      },
    });

    const output = {
      totals: {},
      retrievalErrors: {},
    };
    const failedTaxAccountNames = [];
    for (const response of responses) {
      const taxAccountKey = response.item;
      const taxAccount = taxAccounts[taxAccountKey];
      const taxType = taxTypes[taxAccount.taxTypeId];
      const totals = response.value;
      if (totals) {
        output.totals[taxType] = Object.assign({}, totals);
      } else {
        output.retrievalErrors[taxType] = response.error;
        failedTaxAccountNames.push(taxAccount.accountName);
      }
    }
    this.storeProxy.output = output;
    const failedTaxTypes = Object.keys(output.retrievalErrors);
    // FIXME: Handle duplicate tax types
    if (failedTaxTypes.length > 0) {
      this.setRetryReason(`Failed to get some tax types: ${failedTaxTypes}`);
      /** @type {RunnerInput} */
      const retryInput = { taxAccountNames: failedTaxAccountNames };
      this.storeProxy.retryInput = retryInput;
    }
  }
};

export default GetAllPendingLiabilitiesClientAction;
