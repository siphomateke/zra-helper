import store from '@/store';
import createTask from '@/transitional/tasks';
import {
  ExportFormatCode,
  taxTypes,
  Client,
  TaxTypeNumericalCode,
  TaxTypeCodeMap,
  taxTypeNumericalCodes,
  TaxTypeCode,
} from '../constants';
import { writeJson, unparseCsv, objectToCsvTable } from '../file_utils';
import { taskFunction, parallelTaskMap, getClientIdentifier } from './utils';
import {
  createClientAction,
  ClientActionRunner,
  getInput,
  createOutputFile,
  ClientActionOutputFormatterOptions,
  BaseFormattedOutput,
  BasicRunnerConfig,
} from './base';
import { getPendingLiabilityPage } from '../reports';
import { errorToString } from '../errors';
import { deepAssign, objKeysExact } from '@/utils';
import { TaskId } from '@/store/modules/tasks';
import { ClientActionOutputs, ClientActionOutput } from '@/store/modules/client_actions/types';
import { Omit } from '@/utils';

/** Columns to get from the pending liabilities table */
export const totalsColumns = ['principal', 'interest', 'penalty', 'total'] as const;

type TotalsColumn = typeof totalsColumns[number];

const totalsColumnsNames: { [columnId in TotalsColumn]: string } = {
  principal: 'Principal',
  interest: 'Interest',
  penalty: 'Penalty',
  total: 'Total',
};

/**
 * Totals with two decimal places. The possible totals are all the items in `totalsColumns`.
 */
export type Totals = { [columnId in TotalsColumn]: string };

/**
 * Generates an object with totals that are all one value.
 */
export function generateTotals<
  C extends TotalsColumn[],
  V,
  R extends { [key in C[number]]: V }
>(columns: C, value: V): R {
  const totals: R = {} as R;
  for (const column of columns) {
    totals[column] = value;
  }
  return totals;
}

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

export namespace PendingLiabilitiesAction {
  export interface Input {
    taxTypeIds?: TaxTypeNumericalCode[];
    downloadPages?: boolean;
  }

  export interface Output {
    /** Tax type totals stored by tax type ID. */
    totals: TaxTypeCodeMap<Totals>;
    /** Errors retrieving particular tax types stored by tax type ID. */
    retrievalErrors: TaxTypeCodeMap<any>;
  }

  export interface Failures {
    taxTypeIds: TaxTypeNumericalCode[],
  }
}

interface OutputFormatterOptions extends Omit<
  ClientActionOutputFormatterOptions<PendingLiabilitiesAction.Output>, 
  'output'
> {
  clientOutputs: ClientActionOutputs<PendingLiabilitiesAction.Output>;
}

type OutputFormatter = (options: OutputFormatterOptions) => string;

namespace FormattedOutput {
  export namespace CSV {
    export interface Row extends Partial<Totals> {
      /** The error that the tax type encountered. */
      error?: string;
    }
    export type ClientOutput = BaseFormattedOutput.CSV.ClientOutput<Row>;
    export type Output = BaseFormattedOutput.CSV.Output<Row>;
  }

  export namespace JSON {
    export type TaxTypeErrors = { [taxTypeCode in TaxTypeCode]?: string };
    export interface ClientOutput {
      client: BaseFormattedOutput.JSON.Client;
      actionId: string;
      totals: PendingLiabilitiesAction.Output['totals'];
      taxTypeErrors: TaxTypeErrors;
      error: ClientActionOutput<PendingLiabilitiesAction.Output>['error'];
    }
    export type Output = BaseFormattedOutput.JSON.Output<ClientOutput>;
  }
}

const outputFormatter: OutputFormatter = function outputFormatter({
  clients,
  allClients,
  clientOutputs,
  format,
  anonymizeClients,
}) {
  if (format === ExportFormatCode.CSV) {
    const allClientsById: Map<string, Client> = new Map();
    for (const client of allClients) {
      allClientsById.set(String(client.id), client);
    }

    const clientOutputsByUsername: {
      [username: string]: ClientActionOutput<PendingLiabilitiesAction.Output>
    } = {};
    for (const clientId of Object.keys(clientOutputs)) {
      const client = allClientsById.get(clientId)!;
      clientOutputsByUsername[client.username] = clientOutputs[clientId];
    }

    const csvOutput: FormattedOutput.CSV.Output = {};
    for (const client of allClients) {
      let value: PendingLiabilitiesAction.Output | null = null;
      if (client.username in clientOutputsByUsername) {
        ({ value } = clientOutputsByUsername[client.username]);
      }
      const clientOutput: FormattedOutput.CSV.ClientOutput = {};
      for (const taxType of Object.values(taxTypes)) {
        const row: FormattedOutput.CSV.Row = {};
        if (value && (taxType in value.totals)) {
          Object.assign(row, value.totals[taxType]);
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
  const json: FormattedOutput.JSON.Output = {};
  for (const client of clients) {
    if (client.id in clientOutputs) {
      const output = clientOutputs[client.id];
      let jsonClient: BaseFormattedOutput.JSON.Client = { id: client.id };
      if (!anonymizeClients) {
        jsonClient = Object.assign(jsonClient, {
          name: client.name,
          username: client.username,
        });
      }
      const outputValue = output.value;
      if (outputValue !== null) {
        const taxTypeErrors: FormattedOutput.JSON.TaxTypeErrors = {};
        for (const taxTypeCode of objKeysExact(outputValue.retrievalErrors)) {
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

const GetAllPendingLiabilitiesClientAction = createClientAction<
  PendingLiabilitiesAction.Input,
  PendingLiabilitiesAction.Output
>({
  id: 'getAllPendingLiabilities',
  name: 'Get all pending liabilities',
  requiresTaxTypes: true,
  defaultInput: () => ({
    taxTypeIds: taxTypeNumericalCodes,
    downloadPages: false,
  }),
  inputValidation: {
    taxTypeIds: 'required|taxTypeIds',
    downloadPages: 'required',
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

class PendingLiabilityTotalsRunner extends ClientActionRunner<
  PendingLiabilitiesAction.Input,
  PendingLiabilitiesAction.Output,
  BasicRunnerConfig,
  PendingLiabilitiesAction.Failures,
  > {

  failures: PendingLiabilitiesAction.Failures = {
    taxTypeIds: [],
  };

  constructor() {
    super(GetAllPendingLiabilitiesClientAction);
  }

  // eslint-disable-next-line class-methods-use-this
  getInitialFailuresObj() {
    return {
      taxTypeIds: [],
    };
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
    const retrievalErrors: { [taxTypeId in TaxTypeCode]?: any } = {};
    if ('retrievalErrors' in prevOutput) {
      for (const taxTypeId of objKeysExact(prevOutput.retrievalErrors)) {
        if (!(taxTypeId in totals)) {
          retrievalErrors[taxTypeId] = prevOutput.retrievalErrors[taxTypeId];
        }
      }
    }
    if ('retrievalErrors' in output) {
      for (const taxTypeId of objKeysExact(output.retrievalErrors)) {
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

    const taxTypeIdsInput = getInput<PendingLiabilitiesAction.Input['taxTypeIds']>(input, 'taxTypeIds', { checkArrayLength: false });
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
    for (const response of responses) {
      const taxTypeId = response.item;
      const taxType = taxTypes[taxTypeId];
      if ('value' in response) {
        output.totals[taxType] = Object.assign({}, response.value);
      } else {
        output.retrievalErrors[taxType] = response.error;
        this.failures.taxTypeIds.push(taxTypeId);
      }
    }
    this.setOutput(output);
  }

  anyTaxTypesFailed() {
    return this.failures.taxTypeIds.length > 0;
  }

  checkIfAnythingFailed() {
    return this.anyTaxTypesFailed();
  }

  getRetryReasons() {
    const reasons = super.getRetryReasons();
    if (this.anyTaxTypesFailed()) {
      const failedTaxTypes = this.failures.taxTypeIds.map(taxTypeId => taxTypes[taxTypeId]);
      reasons.push(`Failed to get some tax types: ${failedTaxTypes}`);
    }
    return reasons;
  }

  getRetryInput() {
    const retryInput: PendingLiabilitiesAction.Input = {};
    if (this.anyTaxTypesFailed()) {
      retryInput.taxTypeIds = this.failures.taxTypeIds;
    }
    return retryInput;
  }
};

export default GetAllPendingLiabilitiesClientAction;
