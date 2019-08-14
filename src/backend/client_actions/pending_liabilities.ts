import store from '@/store';
import createTask from '@/transitional/tasks';
import {
  ExportFormatCode,
  taxTypes,
  Client,
  taxTypeCodes,
  taxTypeNumericalCodesArray,
  TaxTypeNumericalCode,
  TaxTypeCodeMap,
} from '../constants';
import { writeJson, unparseCsv, objectToCsvTable } from '../file_utils';
import { taskFunction, parallelTaskMap, getClientIdentifier } from './utils';
import {
  createClientAction,
  ClientActionRunner,
  getInput,
  createOutputFile,
  BasicRunnerConfig,
} from './base';
import { getPendingLiabilityPage } from '../reports';
import { errorToString } from '../errors';
import { deepAssign, joinSpecialLast } from '@/utils';
import { parseAmountString } from '../content_scripts/helpers/zra';
import { TaskId } from '@/store/modules/tasks';

// FIXME: Infer this from totalsColumns
type TotalsColumn = 'principal' | 'interest' | 'penalty' | 'total';

export const pendingLiabilityTypes: TotalsColumn[] = [
  'principal',
  'interest',
  'penalty',
];

/** Columns to get from the pending liabilities table */
export const pendingLiabilityColumns: TotalsColumn[] = [
  ...pendingLiabilityTypes,
  'total',
];

// TODO: Type keys as totalsColumn when using TypeScript
export const pendingLiabilityColumnNamesMap = {
  principal: 'Principal',
  interest: 'Interest',
  penalty: 'Penalty',
  total: 'Total',
};

/**
 * Totals with two decimal places. The possible totals are all the items in `totalsColumns`.
 */
export type Totals = { [K in TotalsColumn]: string };

export type TotalsByTaxTypeCode = TaxTypeCodeMap<Totals>

/**
 * Generates an object with totals that are all one value.
 */
// TODO: Figure out a way to properly type this functions return value based on the passed columns
export function generateTotals<
  V,
  R extends { [key in TotalsColumn]: V }
>(columns: TotalsColumn[], value: V): R {
  const totals: R = {} as R;
  for (const column of columns) {
    totals[column] = value;
  }
  return totals;
}

/**
 * @typedef {Object} PendingLiability
 * @property {string} srNo
 * @property {string} accountName
 * @property {string} periodFrom
 * @property {string} periodTo
 * @property {string} principal
 * @property {string} interest
 * @property {string} penalty
 * @property {string} total
 */

/**
 * Gets the pending liability totals of a tax type.
 */
async function getPendingLiabilities(
  client: Client,
  taxTypeId: TaxTypeNumericalCode,
  parentTaskId: TaskId,
): Promise<Totals | null> {
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

      let totals: Totals | null;
      const { records } = response.parsedTable;
      if (records.length > 0) {
        const totalsRow = records[records.length - 1];
        // Make sure we are getting totals from the grand total row.
        if (totalsRow.srNo.toLowerCase() === 'grand total') {
          totals = {} as Totals;
          for (const column of pendingLiabilityColumns) {
            const cell = totalsRow[column];
            totals[column] = cell.replace(/\n\n/g, '');
          }
        } else {
          totals = null;
        }
      } else {
        totals = generateTotals(pendingLiabilityColumns, '0');
      }

      return totals;
    },
  });
}

export namespace PendingLiabilitiesAction {
  export interface Output {
    /** Tax type totals stored by tax type ID. */
    totals: TaxTypeCodeMap<Totals>;
    /** Errors retrieving particular tax types stored by tax type ID. */
    retrievalErrors: TaxTypeCodeMap<any>;
  }

  export interface Input {
    taxTypeIds?: TaxTypeNumericalCode[];
  }

  export type Config = BasicRunnerConfig;
}

function outputFormatter({
  clients,
  allClients,
  clientOutputs,
  format,
  anonymizeClients,
}) {
  if (format === ExportFormatCode.CSV) {
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
      let value: PendingLiabilitiesAction.Output | null = null;
      if (client.username in clientOutputsByUsername) {
        ({ value } = clientOutputsByUsername[client.username]);
      }
      const totalsObjects = value ? value.totals : null;
      const clientOutput = {};
      for (const taxType of taxTypeCodes) {
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
    pendingLiabilityColumns.forEach((c) => {
      columns.set(c, pendingLiabilityColumnNamesMap[c]);
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

const GetAllPendingLiabilitiesClientAction = createClientAction<PendingLiabilitiesAction.Input>({
  id: 'getAllPendingLiabilities',
  name: 'Get all pending liabilities',
  requiresTaxTypes: true,
  defaultInput: () => ({
    taxTypeIds: taxTypeNumericalCodesArray,
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
      formats: [ExportFormatCode.CSV, ExportFormatCode.JSON],
      defaultFormat: ExportFormatCode.CSV,
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
 * @typedef {Object} ParsedPendingLiabilitiesOutput
 * @property {string} client Human readable name of client. Not a username or ID.
 * @property {TotalsByTaxTypeCode} totals
 */

/**
 * Checks if a parsed pending liability totals file is valid.
 * @param {ParsedPendingLiabilitiesOutput[]} parsedOutput
 * @returns {string[]} Validation errors
 */
function validateParsedCsvOutput(parsedOutput) {
  const errors = [];
  if (Array.isArray(parsedOutput)) {
    for (const item of parsedOutput) {
      const expectedTaxTypeCodes = taxTypeCodes;
      const missingTaxTypeCodes = [];
      for (const taxTypeCode of expectedTaxTypeCodes) {
        if (!(taxTypeCode in item.totals)) {
          missingTaxTypeCodes.push(taxTypeCode);
        }
      }
      if (missingTaxTypeCodes.length > 0) {
        errors.push(`Client '${item.client}' is missing the following tax types: ${joinSpecialLast(missingTaxTypeCodes, ', ', ' and ')}`);
      }
      for (const taxTypeCode of expectedTaxTypeCodes) {
        if (taxTypeCode in item.totals) {
          const taxTypeTotals = item.totals[taxTypeCode];
          for (const liabilityTotal of Object.values(taxTypeTotals)) {
            const parsedAmount = parseAmountString(liabilityTotal);
            if (
              liabilityTotal !== ''
              && (typeof parsedAmount !== 'number' || Number.isNaN(parsedAmount))
            ) {
              errors.push(`'${liabilityTotal}' in ${item.client}->${taxTypeCode}->${liabilityTotal} is not a valid amount`);
            }
          }
        }
      }
    }
  } else {
    errors.push('Not array');
  }
  return errors;
}

/**
 * Parses the pending liabilities CSV output.
 * @param {string} csvString
 * @returns {ParsedPendingLiabilitiesOutput[]}
 */
export function csvOutputParser(csvString) {
  const parsed = Papa.parse(csvString, {
    header: false,
    skipEmptyLines: true,
  });

  /** @type {ParsedPendingLiabilitiesOutput[]} */
  const pendingLiabilities = [];
  let currentClientIdx = -1;
  const { data: rows, errors: csvParseErrors } = parsed;
  if (csvParseErrors.length > 0) {
    throw new Error(`CSV parsing failed: ${csvParseErrors.map(e => e.message).join(', ')}`);
  }
  for (const row of rows) {
    // If the current row contains the name of a client in the first column,
    // start storing totals for that client.
    if (row[0].length > 0) {
      currentClientIdx++;
      pendingLiabilities[currentClientIdx] = {
        client: row[0],
        totals: {},
      };
    }
    const currentClientData = pendingLiabilities[currentClientIdx];
    const taxTypeCode = row[1];
    const taxTypeGrandTotal = {};
    for (let i = 0; i < pendingLiabilityColumns.length; i++) {
      taxTypeGrandTotal[pendingLiabilityColumns[i]] = row[i + 2];
    }
    currentClientData.totals[taxTypeCode] = taxTypeGrandTotal;
  }
  const errors = validateParsedCsvOutput(pendingLiabilities);
  if (errors.length > 0) {
    throw new Error(`Invalid pending liability totals: ${errors.join(', ')}`);
  }
  return pendingLiabilities;
}

GetAllPendingLiabilitiesClientAction.Runner = class extends ClientActionRunner<
  PendingLiabilitiesAction.Input,
  PendingLiabilitiesAction.Output,
  PendingLiabilitiesAction.Config,
  > {
  constructor() {
    super(GetAllPendingLiabilitiesClientAction);
  }

  /**
   * A custom merger is required to make sure retrievalErrors for tax types that have since been
   * successfully retrieved aren't carried over
   */
  // eslint-disable-next-line class-methods-use-this
  mergeRunOutputs(
    prevOutput: PendingLiabilitiesAction.Output,
    output: PendingLiabilitiesAction.Output,
  ): PendingLiabilitiesAction.Output {
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
    const { task: actionTask, client, input } = this.storeProxy;

    let taxTypeIds = client.taxTypes !== null ? client.taxTypes : [];

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

    const output: PendingLiabilitiesAction.Output = {
      totals: {},
      retrievalErrors: {},
    };
    const failedTaxTypeIds = [];
    for (const response of responses) {
      // FIXME: Remove this once task map ambiguous list or count is fixed.
      const taxTypeId = <TaxTypeNumericalCode>response.item;
      const taxType = taxTypes[taxTypeId];
      if ('value' in response) {
        output.totals[taxType] = Object.assign({}, response.value);
      } else {
        output.retrievalErrors[taxType] = response.error;
        failedTaxTypeIds.push(taxTypeId);
      }
    }
    this.setOutput(output);
    const failedTaxTypes = Object.keys(output.retrievalErrors);
    if (failedTaxTypes.length > 0) {
      this.setRetryReason(`Failed to get some tax types: ${failedTaxTypes}`);
      this.storeProxy.retryInput = { taxTypeIds: failedTaxTypeIds };
    }
  }
};

export default GetAllPendingLiabilitiesClientAction;
