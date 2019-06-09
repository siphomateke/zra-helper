import store from '@/store';
import createTask from '@/transitional/tasks';
import { exportFormatCodes, taxTypes } from '../constants';
import { writeJson, unparseCsv, objectToCsvTable } from '../file_utils';
import { taskFunction, parallelTaskMap, getClientIdentifier } from './utils';
import {
  createClientAction, ClientActionRunner, getInput, createOutputFile,
} from './base';
import { getPendingLiabilityPage } from '../reports';
import { errorToString } from '../errors';
import { deepAssign } from '@/utils';

/** Columns to get from the pending liabilities table */
export const totalsColumns = [
  'principal',
  'interest',
  'penalty',
  'total',
];

// TODO: Type keys as totalsColumn when using TypeScript
const totalsColumnsNames = {
  principal: 'Principal',
  interest: 'Interest',
  penalty: 'Penalty',
  total: 'Total',
};

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
export function generateTotals(columns, value) {
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
    const allClientsById = new Map();
    for (const client of allClients) {
      allClientsById.set(String(client.id), client);
    }

    const clientOutputsByUsername = {};
    for (const clientId of Object.keys(clientOutputs)) {
      const client = allClientsById.get(clientId);
      clientOutputsByUsername[client.username] = clientOutputs[clientId];
    }

    const csvOutput = {};
    for (const client of allClients) {
      let value = null;
      if (client.username in clientOutputsByUsername) {
        ({ value } = clientOutputsByUsername[client.username]);
      }
      const totalsObjects = value ? value.totals : null;
      const clientOutput = {};
      for (const taxType of Object.values(taxTypes)) {
        const row = {};
        if (value && (taxType in totalsObjects)) {
          Object.assign(row, totalsObjects[taxType]);
        } else if (value && (taxType in value.retrievalErrors)) {
          // Indicate that this tax type had an error
          row.error = '!';
        }
        clientOutput[taxType] = [row];
      }
      const clientIdentifier = getClientIdentifier(client, anonymizeClients);
      csvOutput[clientIdentifier] = clientOutput;
    }
    const columns = new Map([
      ['client', 'Client'],
      ['taxType', 'Tax type'],
    ]);
    totalsColumns.forEach((c) => {
      columns.set(c, totalsColumnsNames[c]);
    });
    columns.set('error', 'Error');
    const rows = objectToCsvTable(csvOutput, columns);
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
  inputValidation: {
    taxTypeIds: 'required|taxTypeIds',
  },
  hasOutput: true,
  generateOutputFiles({ clients, allClients, outputs }) {
    return createOutputFile({
      label: 'All clients pending liabilities',
      filename: 'pendingLiabilities',
      value: outputs,
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

/**
 * @typedef {Object} RunnerOutput
 * @property {Object.<string, Totals>} totals
 * Tax type totals stored by tax type ID.
 * @property {Object.<string, any>} retrievalErrors
 * Errors retrieving particular tax types stored by tax type ID.
 */

GetAllPendingLiabilitiesClientAction.Runner = class extends ClientActionRunner {
  constructor() {
    super(GetAllPendingLiabilitiesClientAction);
  }

  /**
   * A custom merger is required to make sure retrievalErrors for tax types that have since been
   * successfully retrieved aren't carried over.
   * @param {RunnerOutput} prevOutput
   * @param {RunnerOutput} output
   * @returns {RunnerOutput}
   */
  // eslint-disable-next-line class-methods-use-this
  mergeRunOutputs(prevOutput, output) {
    const { totals } = deepAssign({ totals: prevOutput.totals }, { totals: output.totals }, {
      clone: true,
      concatArrays: true,
    });

    // Only include retrieval errors for tax types that have yet to be retrieved successfully.
    // For example, if getting ITX failed in the first run but succeeded in the last run, the
    // retrieval error should be discarded.
    const retrievalErrors = {};
    if ('retrievalErrors' in prevOutput) {
      for (const taxTypeId of Object.keys(prevOutput.retrievalErrors)) {
        if (!(taxTypeId in totals)) {
          retrievalErrors[taxTypeId] = prevOutput.retrievalErrors[taxTypeId];
        }
      }
    }
    if ('retrievalErrors' in output) {
      for (const taxTypeId of Object.keys(output.retrievalErrors)) {
        retrievalErrors[taxTypeId] = output.retrievalErrors[taxTypeId];
      }
    }

    return {
      totals,
      retrievalErrors,
    };
  }

  async runInternal() {
    const { task: actionTask, client } = this.storeProxy;
    // eslint-disable-next-line prefer-destructuring
    const input = /** @type {RunnerInput} */(this.storeProxy.input);
    let { taxTypes: taxTypeIds } = client;

    const taxTypeIdsInput = getInput(input, 'taxTypeIds', { checkArrayLength: false });
    if (taxTypeIdsInput.exists) {
      taxTypeIds = taxTypeIds.filter(id => taxTypeIdsInput.value.includes(id));
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
    this.setOutput(output);
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
