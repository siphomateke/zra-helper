import store from '@/store';
import createTask, { TaskObject } from '@/transitional/tasks';
import {
  ExportFormatCode,
  taxTypes,
  Client,
  TaxTypeNumericalCode,
  TaxTypeCodeMap,
  taxTypeNumericalCodes,
  TaxTypeCode,
  TPIN,
  TaxTypeIdMap,
  TaxAccountName,
} from '../constants';
import { writeJson, unparseCsv, objectToCsvTable } from '../file_utils';
import {
  taskFunction,
  parallelTaskMap,
  getClientIdentifier,
  downloadPage,
  downloadPages,
  startDownloadingPages,
  finishDownloadingPages,
} from './utils';
import {
  createClientAction,
  ClientActionRunner,
  getInput,
  createOutputFile,
  ClientActionOutputFormatterOptions,
  BaseFormattedOutput,
  BasicRunnerConfig,
  ClientActionOptions,
  ClientActionObject,
} from './base';
import {
  getPendingLiabilityPage,
  getFirstPendingLiabilityPage,
  changeTableOfFullReportPage,
  ZraReportPageUrl,
  parseFullPendingLiabilityPage,
} from '../reports';
import { errorToString } from '../errors';
import {
  deepAssign, objKeysExact, Omit, PickByValue,
} from '@/utils';
import { TaskId, TaskState } from '@/store/modules/tasks';
import { ClientActionOutputs, ClientActionOutput } from '@/store/modules/client_actions/types';

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

type PendingLiabilityPages = { [page: number]: HTMLDocument };

interface GetPendingLiabilitiesFnResponse {
  totals: Totals | null;
  numPages: number;
  pages: PendingLiabilityPages;
  /**
   * Set if there were any errors getting pending liabilities.
   *
   * This is set instead of just throwing an error so the other response properties can be accessed.
   */
  error?: any;
}

/**
 * Gets the pending liability totals of a tax type.
 */
async function getPendingLiabilities(
  client: Client,
  taxTypeId: TaxTypeNumericalCode,
  parentTaskId: TaskId,
): Promise<GetPendingLiabilitiesFnResponse> {
  const task = await createTask(store, {
    title: `Get ${taxTypes[taxTypeId]} totals`,
    parent: parentTaskId,
    unknownMaxProgress: false,
    progressMax: 2,
  });
  return taskFunction({
    task,
    async func() {
      const pages: PendingLiabilityPages = {};

      // TODO: Investigate performance of creating this function here.
      async function getPage(page: number) {
        const response = await getPendingLiabilityPage({
          taxTypeId,
          page,
          tpin: client.username,
        });
        pages[page] = response.reportDocument;
        return response;
      }

      task.status = 'Getting totals from first page';
      let response = await getPage(1);

      let totals: Totals | null = null;
      try {
        if (response.numPages > 1) {
          task.addStep('More than one page found. Getting totals from last page');
          response = await getPage(response.numPages);
        }

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

        return { totals, numPages: response.numPages, pages };
      } catch (error) {
        return {
          totals, numPages: response.numPages, pages, error,
        };
      }
    },
  });
}

interface DownloadPendingLiabilityPageFnOptions {
  tpin: TPIN;
  taxTypeId: TaxTypeNumericalCode;
  parentTaskId: TaskId;
  pendingLiabilityPage: HTMLDocument;
  page: number;
}

function downloadPendingLiabilityPage({
  tpin,
  taxTypeId,
  parentTaskId,
  pendingLiabilityPage,
  page,
}: DownloadPendingLiabilityPageFnOptions) {
  return downloadPage({
    filename: `pendingLiability-${tpin}-${taxTypes[taxTypeId]}-P${page}`,
    taskTitle: 'Download page',
    parentTaskId,
    htmlDocument: pendingLiabilityPage,
    htmlDocumentUrl: ZraReportPageUrl,
  });
}

interface GetPendingLiabilityPageToDownloadFnOptions {
  page: number;
  taxTypeId: TaxTypeNumericalCode;
  tpin: TPIN;
  accountName: TaxAccountName;
  /** Cached inner tables of pending liability pages. */
  cachedPages: PendingLiabilityPages;
  firstPendingLiabilityPage: HTMLDocument | null;
}

async function getPendingLiabilityPageToDownload({
  page,
  taxTypeId,
  tpin,
  accountName,
  cachedPages,
  firstPendingLiabilityPage,
}: GetPendingLiabilityPageToDownloadFnOptions) {
  let pageToDownload: HTMLDocument;
  if (page === 1) {
    // If getting the first page, get the full HTML for the pending liability page
    pageToDownload = await getFirstPendingLiabilityPage({
      taxTypeId,
      tpin,
      accountName,
    });
  } else {
    let pendingLiabilityPage;
    if (page in cachedPages) {
      // Only use a cached version of the page if it's not page 1. This is because the cached pages
      // are only the inner pending liability table and not the full page which is required for
      // page 1.
      pendingLiabilityPage = cachedPages[page];
    } else {
      // If getting any other page, re-use most of the HTML from the first page and just
      // swap out the table with the one from the next page.
      const { reportDocument } = await getPendingLiabilityPage({
        taxTypeId,
        page,
        tpin,
      });
      pendingLiabilityPage = reportDocument;
    }
    if (firstPendingLiabilityPage === null) {
      throw new Error('The first pending liability page was missing but is required to generate the other pages.');
    }
    pageToDownload = await changeTableOfFullReportPage(
      firstPendingLiabilityPage,
      pendingLiabilityPage,
    );
  }
  return pageToDownload;
}

interface GetPageTaskFnOptions {
  page: number;
  parentTaskId: TaskId;
  getPageFn: (page: number) => Promise<{
    pageToDownload: HTMLDocument,
    numPages: number | null,
  }>;
}

/**
 * Creates a task to get a single pending liability page.
 */
async function getPendingLiabilityPageTask({
  page,
  parentTaskId,
  getPageFn,
}: GetPageTaskFnOptions) {
  return taskFunction({
    task: await createTask(store, {
      title: 'Get page',
      parent: parentTaskId,
    }),
    func: () => getPageFn(page),
  });
}

interface DownloadPendingLiabilityPageTaskFnOptions extends GetPageTaskFnOptions {
  taxTypeId: TaxTypeNumericalCode;
  tpin: TPIN;
  /**
   * Whether pending liability pages should be downloaded for tax types with zero pending
   * liabilities.
   */
  shouldDownloadEmptyPages: boolean;
}

async function getAndDownloadPendingLiabilityPageTask({
  page,
  parentTaskId,
  taxTypeId,
  tpin,
  getPageFn,
  shouldDownloadEmptyPages,
}: DownloadPendingLiabilityPageTaskFnOptions) {
  const pageTask = await createTask(store, {
    title: `Download page ${page}`,
    parent: parentTaskId,
    unknownMaxProgress: false,
    progressMax: 2,
  });
  return taskFunction({
    task: pageTask,
    async func() {
      pageTask.status = 'Get page';
      const { pageToDownload, numPages } = await getPendingLiabilityPageTask({
        getPageFn,
        page,
        parentTaskId: pageTask.id,
      });

      if (!shouldDownloadEmptyPages && numPages !== null && numPages === 0) {
        // TODO: Log this
        pageTask.progressMax -= 1;
        return;
      }

      pageTask.addStep('Download page');
      await downloadPendingLiabilityPage({
        taxTypeId,
        tpin,
        parentTaskId: pageTask.id,
        pendingLiabilityPage: pageToDownload,
        page,
      });
    },
  });
}

interface DownloadPendingLiabilityPagesFnOptions {
  parentTaskId: TaskId;
  /**
   * Pages to get with the first one being '1'.
   *
   * Setting this to null means the number of pages and thus which to get is unknown.
   */
  pages: number[] | null;
  cachedPages: PendingLiabilityPages;
  taxTypeId: TaxTypeNumericalCode;
  tpin: TPIN;
  accountName: TaxAccountName;
  /**
   * Whether pending liability pages should be downloaded for tax types with zero pending
   * liabilities.
   */
  shouldDownloadEmptyPages: boolean;
}

// TODO: Consider reducing duplication between this and `getPagedData`.
/**
 * Downloads full pending liability pages.
 *
 * @returns
 * The pages that failed to download.
 * Note: If the first page fails to download, the function throws an error.
 */
async function downloadPendingLiabilityPages({
  parentTaskId: mainParentTaskId,
  pages,
  cachedPages,
  taxTypeId,
  tpin,
  accountName,
  shouldDownloadEmptyPages,
}: DownloadPendingLiabilityPagesFnOptions): Promise<number[]> {
  let firstPendingLiabilityPage: HTMLDocument | null = null;
  /** Pages to get and download. Is only null when the number of pages is unknown. */
  let pagesToGet: number[] | null = null;
  if (pages !== null) {
    pagesToGet = pages.slice();
  }

  const getPage: GetPageTaskFnOptions['getPageFn'] = async function getPage(page) {
    const pageToDownload = await getPendingLiabilityPageToDownload({
      page,
      taxTypeId,
      tpin,
      accountName,
      cachedPages,
      firstPendingLiabilityPage,
    });
    let numPages: number | null = null;
    if (page === 1) {
      // Make sure to clone it because the original copy will be modified when it is downloaded.
      firstPendingLiabilityPage = <HTMLDocument>pageToDownload.cloneNode(true);

      // Find out the number of pages if it's not already known.
      if (pagesToGet === null) {
        ({ numPages } = await parseFullPendingLiabilityPage(pageToDownload));
        pagesToGet = [];
        for (let page = 2; page < numPages + 1; page++) {
          pagesToGet.push(page);
        }
      }
    }
    return { pageToDownload, numPages };
  };

  /**
   * Gets and downloads a page and creates the appropriate tasks.
   */
  async function doPage(page: number, parentTaskId: TaskId, downloadPage: boolean = true) {
    if (downloadPage) {
      return getAndDownloadPendingLiabilityPageTask({
        page,
        parentTaskId,
        getPageFn: getPage,
        taxTypeId,
        tpin,
        shouldDownloadEmptyPages,
      });
    }
    return getPendingLiabilityPageTask({
      page,
      parentTaskId,
      getPageFn: getPage,
    });
  }

  /**
   * Whether the first page should be downloaded as well as retrieved. Automatically set to false
   * when page one was not included in the `pages` parameter.
   */
  let shouldDownloadPageOne: boolean;

  /*
  The first page always needs be retrieved because its HTML is used to generate the other pages
  and to figure out the number of pages if that is not already known.
  However, it only needs to be downloaded if it was included in the `pages` parameter or the
  number of pages was not known.
  */
  if (pagesToGet !== null && !pagesToGet.includes(1)) {
    pagesToGet.push(1);
    shouldDownloadPageOne = false;
  } else {
    shouldDownloadPageOne = true;
  }

  // If the number of pages is unknown, just pretend there is only one page.
  let numPages = pagesToGet !== null ? pagesToGet.length : 1;
  // The number of pages reported by ZRA will be zero when there are no pending liabilities.
  // However, an empty pending liability page can still be downloaded so just treat is as if there
  // is one page.
  if (numPages === 0) {
    numPages = 1;
  }
  let taskTitle: string;
  if (pagesToGet !== null) {
    taskTitle = `Download ${numPages} ${taxTypes[taxTypeId]} pending liability page(s)`;
  } else {
    taskTitle = `Download ${taxTypes[taxTypeId]} pending liability pages`;
  }
  const task = await createTask(store, {
    title: taskTitle,
    parent: mainParentTaskId,
    unknownMaxProgress: false,
    progressMax: numPages,
  });

  await startDownloadingPages();

  const failedPages: number[] = [];

  // Get and possibly download the first page.
  const numPagesWasUnknown = pagesToGet === null;
  if (pagesToGet === null || pagesToGet.length > 1) {
    try {
      await doPage(1, task.id, shouldDownloadPageOne);
    } catch (error) {
      task.markAsComplete();
      task.setError(error);
      throw error;
    } finally {
      // If it is discovered that this was the only page that needed downloading when the total
      // number of pages was originally unknown, mark the task as complete
      if (numPagesWasUnknown && (pagesToGet === null || pagesToGet.length <= 1)) {
        task.state = TaskState.SUCCESS;
        task.markAsComplete();
      }
    }
  } else {
    // Only use the whole task for getting the first page if we are sure it's the only page.
    await taskFunction({
      task,
      func: () => doPage(1, task.id, shouldDownloadPageOne),
    });
  }

  // By this point, `pagesToGet` cannot be null as the total number of pages would have been figured
  // out after getting the first page.
  pagesToGet = <number[]>pagesToGet;

  // Don't get page 1 again
  const pageOneIndex = pagesToGet.indexOf(1);
  if (pageOneIndex > -1) {
    pagesToGet.splice(pageOneIndex, 1);
  }

  if (pagesToGet.length > 0) {
    const results = await downloadPages({
      task,
      list: pagesToGet,
      setTaskMaxProgress: false,
      func: (page, parentTaskId) => doPage(page, parentTaskId),
    });

    for (const result of results) {
      if ('error' in result) {
        failedPages.push(Number(result.item));
      }
    }
  }

  await finishDownloadingPages();

  return failedPages;
}

export namespace BasePendingLiabilitiesAction {
  export interface Input {
    /** Which tax types to get pending liability totals from. */
    totalsTaxTypeIds?: TaxTypeNumericalCode[];
  }

  export interface Output {
    /** Tax type totals stored by tax type ID. */
    totals: TaxTypeCodeMap<Totals>;
    /** Errors retrieving particular tax types stored by tax type ID. */
    retrievalErrors: TaxTypeCodeMap<any>;
  }

  export interface Failures {
    totalsTaxTypeIds: TaxTypeNumericalCode[];
  }
}

interface OutputFormatterOptions extends Omit<
  ClientActionOutputFormatterOptions<BasePendingLiabilitiesAction.Output>,
  'output'
  > {
  clientOutputs: ClientActionOutputs<BasePendingLiabilitiesAction.Output>;
}

type OutputFormatter = (options: OutputFormatterOptions) => string;

namespace FormattedOutput {
  export namespace CSV {
    export interface Row extends Partial<Totals> {
      /** The error that the tax type encountered. */
      error?: string;
    }
    export type ClientOutput = BaseFormattedOutput.CSV.TaxTypeClientOutput<Row>;
    export type Output = BaseFormattedOutput.CSV.TaxTypeOutput<Row>;
  }

  export namespace JSON {
    export type TaxTypeErrors = { [taxTypeCode in TaxTypeCode]?: string };
    export interface ClientOutput {
      client: BaseFormattedOutput.JSON.Client;
      actionId: string;
      totals: BasePendingLiabilitiesAction.Output['totals'];
      taxTypeErrors: TaxTypeErrors;
      error: ClientActionOutput<BasePendingLiabilitiesAction.Output>['error'];
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
      [username: string]: ClientActionOutput<BasePendingLiabilitiesAction.Output>
    } = {};
    for (const clientId of Object.keys(clientOutputs)) {
      const client = allClientsById.get(clientId)!;
      clientOutputsByUsername[client.username] = clientOutputs[clientId];
    }

    const csvOutput: FormattedOutput.CSV.Output = {};
    for (const client of allClients) {
      let value: BasePendingLiabilitiesAction.Output | null = null;
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
};

const BaseGetAllPendingLiabilitiesClientActionOptions: ClientActionOptions<
  BasePendingLiabilitiesAction.Input,
  BasePendingLiabilitiesAction.Output
> = {
  id: 'getAllPendingLiabilities',
  name: 'Get all pending liabilities',
  requiresTaxTypes: true,
  defaultInput: () => ({
    totalsTaxTypeIds: taxTypeNumericalCodes,
  }),
  inputValidation: {
    totalsTaxTypeIds: 'required|taxTypeIds',
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
};

const BaseGetAllPendingLiabilitiesClientAction = createClientAction<
  BasePendingLiabilitiesAction.Input,
  BasePendingLiabilitiesAction.Output
>(BaseGetAllPendingLiabilitiesClientActionOptions);

class PendingLiabilityTotalsRunner<
  Input extends BasePendingLiabilitiesAction.Input = BasePendingLiabilitiesAction.Input,
  Failures extends BasePendingLiabilitiesAction.Failures = BasePendingLiabilitiesAction.Failures
  > extends ClientActionRunner<
  Input,
  BasePendingLiabilitiesAction.Output,
  BasicRunnerConfig,
  Failures
  > {
  failures: Failures = {
    totalsTaxTypeIds: [],
  };

  numPages: TaxTypeIdMap<number> = {};

  /**
   * The retrieved pending liability page inner tables.
   */
  pages: TaxTypeIdMap<PendingLiabilityPages> = {};

  constructor(
    action: ClientActionObject<any, any, any> = BaseGetAllPendingLiabilitiesClientAction,
  ) {
    super(action);
  }

  getInitialFailuresObj() {
    return {
      totalsTaxTypeIds: [],
    };
  }

  /**
   * A custom merger is required to make sure retrievalErrors for tax types that have since been
   * successfully retrieved aren't carried over
   */
  mergeRunOutputs(
    prevOutput: BasePendingLiabilitiesAction.Output,
    output: BasePendingLiabilitiesAction.Output,
  ): BasePendingLiabilitiesAction.Output {
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

  /**
   * Gets a tax type IDs array input by name.
   * @param name The name of the tax type IDs array in the input.
   */
  getTaxTypeIdsToRun(
    client: Client,
    input: Input,
    name: keyof PickByValue<Input, TaxTypeNumericalCode[] | undefined>,
  ) {
    let taxTypeIds = client.taxTypes !== null ? client.taxTypes : [];
    const taxTypeIdsInput = getInput<TaxTypeNumericalCode[] | undefined>(
      input, name, { checkArrayLength: false },
    );
    if (taxTypeIdsInput.exists) {
      taxTypeIds = taxTypeIds.filter(id => taxTypeIdsInput.value.includes(id));
    }
    return taxTypeIds;
  }

  /**
   * Runs the main runner on a particular task.
   *
   * This pretty much only exists so it's easier to extend this class and make the getting totals
   * task a sub-task of a task that isn't the main action task.
   */
  async runUsingTask(task: TaskObject) {
    const { client, input } = this.storeProxy;

    const totalsTaxTypeIds = this.getTaxTypeIdsToRun(client, input, 'totalsTaxTypeIds');

    const responses = await parallelTaskMap({
      task,
      list: totalsTaxTypeIds,
      func: async (taxTypeId, parentTaskId) => {
        const {
          totals,
          numPages,
          pages,
          error,
        } = await getPendingLiabilities(client, taxTypeId, parentTaskId);
        this.numPages[taxTypeId] = numPages;
        this.pages[taxTypeId] = pages;
        if (typeof error !== 'undefined') {
          throw error;
        }
        return totals;
      },
    });

    const output: BasePendingLiabilitiesAction.Output = {
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
        this.failures.totalsTaxTypeIds.push(taxTypeId);
      }
    }
    this.setOutput(output);
  }

  async runInternal() {
    const { task: actionTask } = this.storeProxy;
    await this.runUsingTask(actionTask);
  }

  anyTaxTypesFailed() {
    return this.failures.totalsTaxTypeIds.length > 0;
  }

  checkIfAnythingFailed() {
    return this.anyTaxTypesFailed();
  }

  getRetryReasons() {
    const reasons = super.getRetryReasons();
    if (this.anyTaxTypesFailed()) {
      const failedTaxTypes = this.failures.totalsTaxTypeIds.map(taxTypeId => taxTypes[taxTypeId]);
      reasons.push(`Failed to get some tax types: ${failedTaxTypes}`);
    }
    return reasons;
  }

  getRetryInput() {
    const retryInput: BasePendingLiabilitiesAction.Input = {};
    if (this.anyTaxTypesFailed()) {
      retryInput.totalsTaxTypeIds = this.failures.totalsTaxTypeIds;
    }
    return retryInput;
  }
}

export namespace PendingLiabilitiesAction {
  export interface Input extends BasePendingLiabilitiesAction.Input {
    /** Which tax types to download pending liability pages from. */
    downloadsTaxTypeIds?: TaxTypeNumericalCode[];
    /**
     * Whether pending liability pages should be downloaded as proof that the retrieved totals are
     * correct.
     */
    downloadPages?: boolean;
    /**
     * Whether pending liability pages should be downloaded for tax types with zero pending
     * liabilities.
     */
    downloadEmptyPages?: boolean;
    /** Pending liability pages to download. */
    pages?: TaxTypeIdMap<number[]>;
  }

  export interface Output extends BasePendingLiabilitiesAction.Output { }

  export interface Failures extends BasePendingLiabilitiesAction.Failures {
    downloadsTaxTypeIds: TaxTypeNumericalCode[];
    /** Pending liability pages that failed to download */
    pages: TaxTypeIdMap<number[]>;
  }
}

const GetAllPendingLiabilitiesClientAction = createClientAction<
  PendingLiabilitiesAction.Input,
  PendingLiabilitiesAction.Output
  >({
    ...BaseGetAllPendingLiabilitiesClientActionOptions,
    defaultInput: () => ({
      ...BaseGetAllPendingLiabilitiesClientActionOptions.defaultInput!(),
      downloadsTaxTypeIds: taxTypeNumericalCodes,
      downloadPages: false,
      downloadEmptyPages: false,
    }),
    inputValidation: {
      ...BaseGetAllPendingLiabilitiesClientActionOptions.inputValidation,
      totalsTaxTypeIds: 'required_if:downloadPages,false|taxTypeIds',
      downloadsTaxTypeIds: 'required_if:downloadPages,true|taxTypeIds',
      downloadPages: 'required',
    },
  });

/**
 * Gets pending liability totals and downloads the pages the totals were retrieved from as proof.
 *
 * This doesn't currently need to be separate from the main `PendingLiabilityTotalsRunner` but is
 * just so it will be easier to do make it separate if that is required in the future.
 */
// TODO: Add retry testing
class DownloadPendingLiabilityPagesRunner extends PendingLiabilityTotalsRunner<
  PendingLiabilitiesAction.Input,
  PendingLiabilitiesAction.Failures
  > {
  failures: PendingLiabilitiesAction.Failures = {
    totalsTaxTypeIds: [],
    downloadsTaxTypeIds: [],
    pages: {},
  };

  constructor() {
    super(GetAllPendingLiabilitiesClientAction);
  }

  getInitialFailuresObj() {
    return {
      ...super.getInitialFailuresObj(),
      downloadsTaxTypeIds: [],
      pages: {},
    };
  }

  /**
   * Gets pending liability totals and then, if the `downloadPages` input is set to true,
   * downloads the pages they were retrieved from.
   *
   * Note: the only reason this function has parameters is for performance reasons. They could all
   * alternatively be retrieved from the `storeProxy`.
   *
   * @param shouldDownloadEmptyPages
   * Whether pending liability pages should be downloaded for tax types with zero pending
   * liabilities.
   */
  async runAndDownloadPages(
    actionTask: TaskObject,
    input: PendingLiabilitiesAction.Input,
    client: Client,
    shouldGetTotals: boolean,
    shouldDownloadEmptyPages: boolean,
  ) {
    // Get totals but don't let any errors that occur while getting them prevent
    // the pending liability pages from being downloaded.
    let error;
    if (shouldGetTotals) {
      try {
        const totalsTask = await createTask(store, {
          title: 'Get pending liability totals',
          parent: actionTask.id,
        });
        await super.runUsingTask(totalsTask);
      } catch (e) {
        error = e;
      }
    }

    const downloadsTaxTypeIds = this.getTaxTypeIdsToRun(client, input, 'downloadsTaxTypeIds');
    const responses = await parallelTaskMap({
      task: await createTask(store, {
        title: 'Download pending liability pages',
        parent: actionTask.id,
      }),
      list: downloadsTaxTypeIds,
      func: async (taxTypeId, parentTaskId) => {
        let pagesToDownload: number[] | null = null;
        const pagesToDownloadInput = getInput<Exclude<Exclude<PendingLiabilitiesAction.Input['pages'], undefined>[TaxTypeNumericalCode], undefined>>(input, `pages.${taxTypeId}`, { defaultValue: [] });
        if (pagesToDownloadInput.exists) {
          pagesToDownload = pagesToDownloadInput.value;
        } else {
          const numPages = this.numPages[taxTypeId];
          if (typeof numPages !== 'undefined') {
            // If we aren't supposed to download pending liabilities with no records and this
            // tax type has no records, stop right here.
            if (!shouldDownloadEmptyPages && numPages === 0) {
              return;
            }
            pagesToDownload = [];
            for (let page = 1; page < numPages + 1; page++) {
              pagesToDownload.push(page);
            }
          }
        }

        let cachedPages: PendingLiabilityPages = {};
        if (typeof this.pages[taxTypeId] !== 'undefined') {
          cachedPages = this.pages[taxTypeId];
        }

        const taxAccount = client.taxAccounts.find(account => account.taxTypeId === taxTypeId);
        const failedPages = await downloadPendingLiabilityPages({
          tpin: client.username,
          pages: pagesToDownload,
          cachedPages,
          parentTaskId,
          accountName: taxAccount.accountName,
          taxTypeId,
          shouldDownloadEmptyPages,
        });
        if (failedPages.length > 0) {
          this.failures.pages[taxTypeId] = failedPages;
          this.failures.downloadsTaxTypeIds.push(taxTypeId);
        }
      },
    });
    for (const response of responses) {
      const taxTypeId = response.item;
      if ('error' in response && !this.failures.downloadsTaxTypeIds.includes(taxTypeId)) {
        this.failures.downloadsTaxTypeIds.push(taxTypeId);
      }
    }

    // Now that pending liability pages have been downloaded, if an error was caught when getting
    // totals, throw it.
    if (shouldGetTotals && typeof error !== 'undefined') {
      throw error;
    }
  }

  async runInternal() {
    const { task: actionTask, input, client } = this.storeProxy;

    const { value: shouldDownloadPages } = getInput<Exclude<PendingLiabilitiesAction.Input['downloadPages'], undefined>>(input, 'downloadPages', { defaultValue: false });
    const { value: shouldDownloadEmptyPages } = getInput<Exclude<PendingLiabilitiesAction.Input['downloadEmptyPages'], undefined>>(input, 'downloadEmptyPages', { defaultValue: false });
    const totalsTaxTypeIds = this.getTaxTypeIdsToRun(client, input, 'totalsTaxTypeIds');
    const shouldGetTotals = totalsTaxTypeIds.length > 0;

    if (shouldGetTotals) {
      actionTask.progressMax = 1;
    }
    if (shouldDownloadPages) {
      actionTask.unknownMaxProgress = false;
      actionTask.progressMax += 1;
      await taskFunction({
        task: actionTask,
        setStateBasedOnChildren: true,
        func: () => this.runAndDownloadPages(
          actionTask,
          input,
          client,
          shouldGetTotals,
          shouldDownloadEmptyPages,
        ),
      });
    } else {
      await super.runInternal();
    }
  }

  anyPendingLiabilityPagesFailed() {
    return Object.keys(this.failures.pages).length > 0;
  }

  checkIfAnythingFailed() {
    return super.checkIfAnythingFailed() || this.anyPendingLiabilityPagesFailed();
  }

  getRetryReasons() {
    const reasons = super.getRetryReasons();
    if (this.anyPendingLiabilityPagesFailed()) {
      reasons.push('Failed to download some pending liability pages');
    }
    return reasons;
  }

  getRetryInput() {
    const retryInput: PendingLiabilitiesAction.Input = {
      ...super.getRetryInput(),
      pages: {},
      downloadsTaxTypeIds: [],
    };
    if (this.anyPendingLiabilityPagesFailed()) {
      retryInput.pages = this.failures.pages;
      retryInput.downloadsTaxTypeIds = this.failures.downloadsTaxTypeIds;
    }
    return retryInput;
  }
}

GetAllPendingLiabilitiesClientAction.Runner = DownloadPendingLiabilityPagesRunner;

export default GetAllPendingLiabilitiesClientAction;
