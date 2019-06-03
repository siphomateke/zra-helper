import store from '@/store';
import createTask from '@/transitional/tasks';
import { exportFormatCodes, taxTypes } from '../constants';
import { writeJson, unparseCsv } from '../file_utils';
import { taskFunction, parallelTaskMap, getClientIdentifier } from './utils';
import {
  createClientAction, ClientActionRunner, inInput, createOutputFile,
} from './base';
import { getPendingLiabilityPage } from '../reports';
import { errorToString } from '../errors';

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
 * @param {import('../constants').TaxTypeNumericalCode} taxTypeId
 * @param {number} parentTaskId
 * @returns {Promise<Totals|null>}
 */
async function getPendingLiabilities(client, taxTypeId, parentTaskId) {
  const taxType = taxTypes[taxTypeId];

  const task = await createTask(store, {
    title: `Get ${taxType} totals`,
    parent: parentTaskId,
    progressMax: 2,
  });
  return taskFunction({
    task,
    async func() {
      task.status = 'Getting totals from first page';
      let response = await getPendingLiabilityPage({
        taxTypeId,
        page: 1,
        tpin: client.username,
      });

      if (response.numPages > 1) {
        task.addStep('More than one page found. Getting totals from last page');
        response = await getPendingLiabilityPage({
          taxTypeId,
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
}

function outputFormatter({
  clients,
  allClients,
  clientOutputs,
  format,
  anonymizeClients,
}) {
  if (format === exportFormatCodes.CSV) {
    const rows = [];
    const columnOrder = totalsColumns;
    // Columns are: client identifier, ...totals, error
    const numberOfColumns = 2 + totalsColumns.length + 1;

    const allClientsById = new Map();
    for (const client of allClients) {
      allClientsById.set(String(client.id), client);
    }

    const clientOutputsByUsername = {};
    for (const clientId of Object.keys(clientOutputs)) {
      const client = allClientsById.get(clientId);
      clientOutputsByUsername[client.username] = clientOutputs[clientId];
    }

    for (const client of allClients) {
      let value = null;
      if (client.username in clientOutputsByUsername) {
        ({ value } = clientOutputsByUsername[client.username]);
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
    return unparseCsv(rows);
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
      const outputValue = output.value;
      if (outputValue !== null) {
        const taxTypeErrors = {};
        for (const taxTypeCode of Object.keys(outputValue.retrievalErrors)) {
          const error = outputValue.retrievalErrors[taxTypeCode];
          taxTypeErrors[taxTypeCode] = errorToString(error);
        }
        json[client.id] = {
          client: jsonClient,
          actionId: output.actionId,
          totals: outputValue.totals,
          taxTypeErrors,
          error: output.error,
        };
      } else {
        json[client.id] = null;
      }
    }
  }
  return writeJson(json);
}

const GetAllPendingLiabilitiesClientAction = createClientAction({
  id: 'getAllPendingLiabilities',
  name: 'Get all pending liabilities',
  requiresTaxTypes: true,
  defaultInput: () => ({
    taxTypeIds: Object.keys(taxTypes),
  }),
  hasOutput: true,
  generateOutputFiles({ clients, allClients, outputs }) {
    return createOutputFile({
      label: 'All clients pending liabilities',
      filename: 'pendingLiabilities',
      value: outputs,
      preview: true,
      formats: [exportFormatCodes.CSV, exportFormatCodes.JSON],
      defaultFormat: exportFormatCodes.CSV,
      formatter: ({ output, format, anonymizeClients }) => outputFormatter({
        clients,
        allClients,
        clientOutputs: output,
        format,
        anonymizeClients,
      }),
    });
  },
});

/**
 * @typedef {Object} RunnerInput
 * @property {import('../constants').TaxTypeNumericalCode[]} [taxTypeIds]
 */

GetAllPendingLiabilitiesClientAction.Runner = class extends ClientActionRunner {
  constructor(data) {
    super(data, GetAllPendingLiabilitiesClientAction);
  }

  async runInternal() {
    const { task: actionTask, client } = this.storeProxy;
    // eslint-disable-next-line prefer-destructuring
    const input = /** @type {RunnerInput} */(this.storeProxy.input);
    let { taxTypes: taxTypeIds } = client;

    if (inInput(input, 'taxTypeIds')) {
      taxTypeIds = taxTypeIds.filter(id => input.taxTypeIds.includes(id));
    }

    const responses = await parallelTaskMap({
      task: actionTask,
      list: taxTypeIds,
      async func(taxTypeId, parentTaskId) {
        return getPendingLiabilities(client, taxTypeId, parentTaskId);
      },
    });

    const output = {
      totals: {},
      retrievalErrors: {},
    };
    const failedTaxTypeIds = [];
    for (const response of responses) {
      const taxTypeId = response.item;
      const taxType = taxTypes[taxTypeId];
      const totals = response.value;
      if (totals) {
        output.totals[taxType] = Object.assign({}, totals);
      } else {
        output.retrievalErrors[taxType] = response.error;
        failedTaxTypeIds.push(taxTypeId);
      }
    }
    this.storeProxy.output = output;
    const failedTaxTypes = Object.keys(output.retrievalErrors);
    if (failedTaxTypes.length > 0) {
      this.setRetryReason(`Failed to get some tax types: ${failedTaxTypes}`);
      /** @type {RunnerInput} */
      const retryInput = { taxTypeIds: failedTaxTypeIds };
      this.storeProxy.retryInput = retryInput;
    }
  }
};

export default GetAllPendingLiabilitiesClientAction;
