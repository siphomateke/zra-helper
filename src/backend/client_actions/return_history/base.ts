import moment from 'moment';
import set from 'lodash.set';
import store from '@/store';
import createTask, { TaskObject } from '@/transitional/tasks';
import {
  taxTypes,
  TaxTypeNumericalCode,
  ReferenceNumber,
  TPIN,
  Client,
  TaxTypeIdMap,
  TaxTypeCode,
  DateString,
  taxTypeNumericalCodes,
} from '../../constants';
import { getDocumentByAjax } from '../../utils';
import { parseTableAdvanced } from '../../content_scripts/helpers/zra';
import {
  parallelTaskMap,
  taskFunction,
  downloadPages,
  GetDataFromPageFunctionReturn,
} from '../utils';
import {
  startDownloadingReceipts,
  finishDownloadingReceipts,
  getFailedResponseItems,
  getReceiptData,
} from '../receipts';
import {
  ClientActionRunner,
  inputExists,
  getInput,
  ClientActionOptions,
  BasicRunnerOutput,
  ClientActionObject,
} from '../base';
import { TaskId } from '@/store/modules/tasks';

/** Excise type numerical code. For example, '20025012' (Airtime) and '20025007' (ElectricalEnergy). */
enum ExciseType {
  Airtime = '20025012',
  ElectricalEnergy = '20025007',
  OpaqueBeer = '20025011',
  OtherThanOpaqueBeer = '20025008',
  FuelTerminal = '20025010',
  SpiritsAndWine = '20025009',
}

export interface TaxReturn {
  srNo: string;
  referenceNo: ReferenceNumber;
  searchCode: string;
  returnPeriodFrom: string;
  returnPeriodTo: string;
  returnAppliedDate: string;
  accountName: string;
  applicationType: string;
  /** Financial account status code with an asterisk at the end. */
  status: string;
  appliedThrough: string;
  receipt: string;
  submittedForm: string;
}

interface GetReturnHistoryRecordsFnOptions {
  tpin: TPIN;
  taxType: TaxTypeNumericalCode;
  fromDate: DateString;
  toDate: DateString;
  exciseType: ExciseType;
}

/**
 * Gets return history records that match the given criteria.
 */
async function getReturnHistoryRecords(
  page: number,
  {
    tpin, taxType, fromDate, toDate, exciseType,
  }: GetReturnHistoryRecordsFnOptions,
): Promise<GetDataFromPageFunctionReturn<TaxReturn[]>> {
  const doc = await getDocumentByAjax({
    url: 'https://www.zra.org.zm/retHist.htm',
    method: 'post',
    data: {
      'retHistVO.fromDate': fromDate,
      'retHistVO.toDate': toDate,
      'retHistVO.rtnackNo': '',
      'retHistVO.rtnType': taxType,
      'retHistVO.rtnTypeExc': exciseType,
      'retHistVO.tinNo': tpin,
      currentPage: page,
      actionCode: 'dealerReturnsView',
      dispatch: 'dealerReturnsView',
    },
  });

  const table = await parseTableAdvanced({
    root: doc,
    headers: [
      'srNo',
      'referenceNo',
      'searchCode',
      'returnPeriodFrom',
      'returnPeriodTo',
      'returnAppliedDate',
      'accountName',
      'applicationType',
      'status',
      'appliedThrough',
      'receipt',
      'submittedForm',
    ],
    tableInfoSelector: '#ReturnHistoryForm>table:nth-child(8)>tbody>tr>td',
    recordSelector: '#ReturnHistoryForm>table.FORM_TAB_BORDER.marginStyle>tbody>tr.whitepapartd.borderlessInput',
    noRecordsString: 'No Data Found',
  });
  let { records } = table;
  records = records.filter(record => record.appliedThrough.toLowerCase() === 'online');
  return {
    numPages: table.numPages,
    value: records,
  };
}

interface GenerateDownloadFileNameFnOptions {
  type: string;
  client: Client;
  taxType: TaxTypeNumericalCode;
  taxReturn: TaxReturn;
}

export function generateDownloadFilename({
  type,
  client,
  taxType,
  taxReturn,
}: GenerateDownloadFileNameFnOptions) {
  const date = moment(taxReturn.returnPeriodFrom, 'DD/MM/YYYY');
  let dateString = '';
  if (taxType === TaxTypeNumericalCode.ITX) {
    dateString = date.format('YYYY');
  } else {
    dateString = date.format('YYYY-MM');
  }
  return `${type}-${client.username}-${taxTypes[taxType]}-${dateString}-${taxReturn.referenceNo}`;
}

export namespace ReturnHistoryClientAction {
  export interface Input {
    fromDate?: DateString;
    toDate?: DateString;
    taxTypeIds?: TaxTypeNumericalCode[];
    /** Returns by tax type ID. */
    returns?: TaxTypeIdMap<TaxReturn[]>;
    /** Return history pages by tax type ID. */
    returnHistoryPages?: TaxTypeIdMap<number[]>;
  }
}

type RunnerInput = ReturnHistoryClientAction.Input;

export const GetReturnHistoryClientActionOptions: Partial<ClientActionOptions<RunnerInput>> = {
  requiresTaxTypes: true,
  defaultInput: () => ({
    taxTypeIds: taxTypeNumericalCodes,
    fromDate: '01/01/2013',
    toDate: moment().format('31/12/YYYY'),
  }),
  inputValidation: {
    taxTypeIds: 'required|taxTypeIds',
    fromDate: 'required|date_format:dd/MM/yyyy|before:toDate,true',
    toDate: 'required|date_format:dd/MM/yyyy|after:fromDate,true',
  },
};

interface TaxTypeFailure {
  returns?: TaxReturn[];
  returnHistoryPages?: number[];
  errorThrown: boolean;
  failed: boolean;
}

type TaxTypeFailures = TaxTypeIdMap<TaxTypeFailure>;

type TaxTypeTaskTitleFn = (taxType: TaxTypeCode) => string;

interface GetReturnsInternalFnOptions {
  task: TaskObject;
  taxTypeId: TaxTypeNumericalCode;
  pages: number[];
}

interface GetReturnsFnOptions {
  task: TaskObject;
  input: RunnerInput;
  taxTypeId: TaxTypeNumericalCode;
  failures: TaxTypeFailure;
}

interface TaxTypeFuncFnOptions {
  failures: TaxTypeFailure;
  input: RunnerInput;
  task: TaskObject;
}

type TaxTypeFunc = (options: TaxTypeFuncFnOptions) => Promise<any>;

interface RunTaxTypeTaskFnOptions {
  taxTypeId: TaxTypeNumericalCode;
  parentTaskId: TaskId;
  input: RunnerInput;
  /** Function to run on the tax type. */
  taxTypeFunc: TaxTypeFunc;
}

interface GetReturnsForTaxTypeFnOptions {
  taxTypeId: TaxTypeNumericalCode;
  parentTaskId: TaskId;
  input: RunnerInput;
}

interface RunTaxTypeTaskAbstractFnOptions {
  taxTypeId: TaxTypeNumericalCode;
  parentTaskId: TaskId;
  input: RunnerInput;
}

export class ReturnHistoryRunner<
  Input extends RunnerInput = RunnerInput,
  Output = BasicRunnerOutput
  > extends ClientActionRunner<Input, Output> {
  taxTypeTaskTitle: TaxTypeTaskTitleFn = () => '';

  failures: TaxTypeFailures = {};

  anyFailures: boolean = false;

  /** Returns per tax type ID. Includes returns that are being retried. */
  taxTypeReturns: { [taxTypeId: string]: TaxReturn[] } = {};

  // TODO: Make sure the reason is always known.
  getUnknownRetryReasonMessage = () => 'Failed for unknown reason.';

  /**
   * Stores the tax returns for a particular tax type.
   */
  addTaxTypesReturns(taxTypeId: TaxTypeNumericalCode, returns: TaxReturn[]) {
    if (!(taxTypeId in this.taxTypeReturns)) {
      this.taxTypeReturns[taxTypeId] = [];
    }
    this.taxTypeReturns[taxTypeId].push(...returns);
  }

  async getReturnsInternal({ task, taxTypeId, pages }: GetReturnsInternalFnOptions) {
    const { client, input } = this.storeProxy;

    const response = await getReceiptData({
      parentTaskId: task.id,
      taskTitle: 'Get returns',
      getPageTaskTitle: page => `Getting returns from page ${page}`,
      getDataFunction: page => getReturnHistoryRecords(page, {
        tpin: client.username,
        taxType: taxTypeId,
        fromDate: input.fromDate,
        toDate: input.toDate,
        exciseType: ExciseType.Airtime,
      }),
      pages,
    });
    return {
      returns: response.data,
      failedPages: response.failedPages,
    };
  }

  /**
   * Gets tax returns using the action's input and stores any failed pages.
   */
  async getReturns({
    task, input, taxTypeId, failures,
  }: GetReturnsFnOptions) {
    // If getting certain return history pages failed last time, only get those pages.
    const { value: pages } = getInput(input, `returnHistoryPages.${taxTypeId}`, { defaultValue: [] });

    task.status = 'Getting returns';
    const returns: TaxReturn[] = [];
    try {
      const data = await this.getReturnsInternal({ task, taxTypeId, pages });
      failures.returnHistoryPages = data.failedPages;
      returns.push(...data.returns);
    } catch (error) {
      if (pages.length > 0) {
        // If a specific page was specified but failed, then an error was thrown
        // and we must manually set the `returnHistoryPages` failure.
        failures.returnHistoryPages = pages;
      }
      throw error;
    }
    this.addTaxTypesReturns(taxTypeId, returns);
  }

  /**
   * Returns whether a tax type failed based on the provided `TaxTypeFailure`.
   */
  // eslint-disable-next-line class-methods-use-this
  checkIfTaxTypeFailed(failures: TaxTypeFailure): boolean {
    return failures.errorThrown || failures.returnHistoryPages.length > 0;
  }

  /**
   * Creates a task and runs the passed `taxTypeFunc` on a single tax type.
   * @returns Any failures encountered.
   */
  async runTaxTypeTask({
    taxTypeId, parentTaskId, input, taxTypeFunc,
  }: RunTaxTypeTaskFnOptions): Promise<TaxTypeFailure> {
    const taxType = taxTypes[taxTypeId];

    const failures: TaxTypeFailure = {
      returnHistoryPages: [],
      errorThrown: false,
      failed: false,
    };

    const task = await createTask(store, {
      title: this.taxTypeTaskTitle(taxType),
      parent: parentTaskId,
      unknownMaxProgress: false,
      progressMax: 1,
    });
    await taskFunction({
      task,
      catchErrors: true,
      setStateBasedOnChildren: true,
      func: async () => {
        try {
          await taxTypeFunc({ failures, input, task });
        } catch (error) {
          failures.errorThrown = true;
          throw error;
        }
      },
    });
    failures.failed = this.checkIfTaxTypeFailed(failures);
    return failures;
  }

  getReturnsForTaxType({ taxTypeId, parentTaskId, input }: GetReturnsForTaxTypeFnOptions) {
    return this.runTaxTypeTask({
      input,
      taxTypeId,
      parentTaskId,
      taxTypeFunc: ({ task, input, failures }) => this.getReturns({
        task, input, taxTypeId, failures,
      }),
    });
  }

  /**
   * Function to run on every tax type. Should return tax type failure.
   * Essentially a wrapper for `runTaxTypeTask` to make it easier to change its behaviour.
   */
  runTaxTypeTaskAbstract({
    taxTypeId, parentTaskId, input,
  }: RunTaxTypeTaskAbstractFnOptions): Promise<TaxTypeFailure> {
    return this.getReturnsForTaxType({ taxTypeId, parentTaskId, input });
  }

  /**
   * Runs `runTaxTypeTaskAbstract` on every tax type and stores the failures.
   */
  async runAllTaxTypes() {
    // We get the input here once to reduce the overhead from querying Vuex.
    const { client, task, input } = this.storeProxy;

    let taxTypeIds = client.taxTypes !== null ? client.taxTypes : [];

    // Filter tax type IDs using input
    const taxTypeIdsInput = getInput(input, 'taxTypeIds', { checkArrayLength: false });
    if (taxTypeIdsInput.exists) {
      taxTypeIds = taxTypeIds.filter(id => taxTypeIdsInput.value.includes(id));
    }

    await parallelTaskMap({
      list: taxTypeIds,
      task,
      func: async (taxTypeId, parentTaskId) => {
        const taxTypeFailure = await this.runTaxTypeTaskAbstract({
          input, taxTypeId, parentTaskId,
        });
        if (taxTypeFailure.failed) {
          this.failures[taxTypeId] = taxTypeFailure;
          this.anyFailures = true;
        }
      },
    });
  }

  /**
   * Checks if retrieving any return history pages failed.
   */
  anyPagesFailed() {
    let anyPagesFailed = false;
    for (const taxTypeId of Object.keys(this.failures)) {
      const failure = this.failures[taxTypeId];
      if (failure.returnHistoryPages.length > 0) {
        anyPagesFailed = true;
      }
    }
    return anyPagesFailed;
  }

  getRetryReasons(): string[] {
    const reasons = [];
    if (this.anyPagesFailed()) {
      reasons.push('Some return history pages could not be retrieved.');
    }
    return reasons;
  }

  getRetryReason() {
    const reasons = this.getRetryReasons();
    if (reasons.length > 0) {
      return reasons.join(', ');
    }
    return this.getUnknownRetryReasonMessage();
  }

  getRetryInput(): RunnerInput {
    const retryInput: RunnerInput = {
      taxTypeIds: [],
    };
    for (const taxTypeId of Object.keys(this.failures)) {
      const failure = this.failures[taxTypeId];
      if (failure.returnHistoryPages.length > 0) {
        set(retryInput, ['returnHistoryPages', taxTypeId], failure.returnHistoryPages);
      }
      retryInput.taxTypeIds.push(taxTypeId);
    }
    return retryInput;
  }

  async runInternal() {
    this.anyFailures = false;
    try {
      await this.runAllTaxTypes();
    } finally {
      if (this.anyFailures) {
        this.storeProxy.shouldRetry = true;
        this.storeProxy.retryReason = this.getRetryReason();
        this.storeProxy.retryInput = this.getRetryInput();
      }
    }
  }
}

interface TaxTypeRunInfo {
  input: RunnerInput;
  taxTypeId: TaxTypeNumericalCode
}

type ShouldRunReturnDependentFuncOnTaxTypeFn = (options: TaxTypeRunInfo) => boolean;

type TaxTypeTaskProgressMaxFn = (options: TaxTypeRunInfo) => number;

export interface ReturnDependentFnOptions {
  input: RunnerInput;
  returns: TaxReturn[];
  task: TaskObject;
  taxTypeId: TaxTypeNumericalCode;
}

/**
 * @returns Any tax returns that the dependent function failed to run on and should be retried.
 */
type ReturnDependentFn = (options: ReturnDependentFnOptions) => Promise<TaxReturn[]>

interface AbstractTaxTypeFuncOptions {
  task: TaskObject;
  input: RunnerInput;
  taxTypeId: TaxTypeNumericalCode;
  failures: TaxTypeFailure;
}

type AbstractTaxTypeFunc = (options: AbstractTaxTypeFuncOptions) => Promise<any>;

// TODO: Don't duplicate AbstractTaxTypeFuncOptions
interface GetReturnsSmartFnOptions {
  task: TaskObject;
  input: RunnerInput;
  taxTypeId: TaxTypeNumericalCode;
  failures: TaxTypeFailure;
}

/**
 * Runs an extra step on each collected tax return.
 *
 * When extending this class, make sure to give a message for returns failing by extending
 * `getRetryReasons`.
 */
// FIXME: Use different input and output types
export abstract class ReturnHistoryReturnDependentRunner<
  Input extends RunnerInput = RunnerInput,
  Output = BasicRunnerOutput
  > extends ReturnHistoryRunner<Input, Output> {
  /**
   * Function that decides whether the function that depends on returns should be run on a
   * particular tax type.
   */
  shouldRunReturnDependentFuncOnTaxType: ShouldRunReturnDependentFuncOnTaxTypeFn = () => true;

  /** Maximum progress for the task run on each tax type. */
  taxTypeTaskProgressMax: TaxTypeTaskProgressMaxFn = ({ input, taxTypeId }) => {
    let progressMax = 2;
    if (!this.shouldRunReturnDependentFuncOnTaxType({ input, taxTypeId })) {
      progressMax--;
    }
    return progressMax;
  };

  /**
   * Function that will be run on and depends on the returns of each tax type.
   *
   * If the function fails to run on any returns, they must be returned as an array.
   *
   * Note: Make sure to set task status in this function.
   */
  returnDependentFunc: ReturnDependentFn | null = null;

  /** Function to be run on each tax type. */
  taxTypeFunc: AbstractTaxTypeFunc | null = null;

  /**
   * Gets all tax returns, or those that failed or were from pages that failed in the previous run.
   *
   * Calls `addTaxTypesReturns` to add the retrieved tax returns.
   */
  async getReturnsSmart({
    task, input, taxTypeId, failures,
  }: GetReturnsSmartFnOptions) {
    // If only certain returns failed in the last run, use those.
    const returnsInput = getInput(input, `returns.${taxTypeId}`, { defaultValue: [] });
    this.addTaxTypesReturns(taxTypeId, returnsInput.value);

    const pagesInputExists = inputExists(input, `returnHistoryPages.${taxTypeId}`);
    if (pagesInputExists || !returnsInput.exists) {
      try {
        await this.getReturns({
          task, input, taxTypeId, failures,
        });
      } catch (error) {
        /*
        If there was an error getting return history pages but some returns were already
        specified in the input, ignore the error and just get the returns.

        This isn't strictly necessary since pretty much the only time `getReturns` throws an
        error is when getting the first page fails. If the first page was being retrieved that
        means no previous run successfully got returns as the first page is required to know
        how many pages there are and thus get the other pages. This would mean no returns would
        be in the input unless the user explicitly added some.
        */
        if (!returnsInput.exists) {
          throw error;
        }
      }
    }
  }

  checkIfTaxTypeFailed(failures: TaxTypeFailure): boolean {
    return super.checkIfTaxTypeFailed(failures)
      || failures.returns.length > 0;
  }

  async runTaxTypeTaskAbstract({ input, taxTypeId, parentTaskId }: RunTaxTypeTaskAbstractFnOptions) {
    return this.runTaxTypeTask({
      input,
      taxTypeId,
      parentTaskId,
      taxTypeFunc: async ({ input, task, failures }) => {
        task.progressMax = this.taxTypeTaskProgressMax({ input, taxTypeId });
        // This must be set here so a default value exists even if errors are later thrown.
        failures.returns = [];

        await this.getReturnsSmart({
          task, input, taxTypeId, failures,
        });

        if (this.shouldRunReturnDependentFuncOnTaxType({ input, taxTypeId })) {
          const returns = this.taxTypeReturns[taxTypeId];
          if (returns.length > 0) {
            failures.returns = await this.returnDependentFunc({
              input,
              returns,
              task,
              taxTypeId,
            });
          }
        }

        // This is to allow sub-classes to add more things to run on each tax type
        if (this.taxTypeFunc !== null) {
          await this.taxTypeFunc({
            task, input, taxTypeId, failures,
          });
        }
      },
    });
  }

  /**
   * Whether running anything on returns failed.
   */
  anyReturnsFailed() {
    for (const taxTypeId of Object.keys(this.failures)) {
      const failure = this.failures[taxTypeId];
      if (failure.returns.length > 0) {
        return true;
      }
    }
    return false;
  }

  getRetryInput() {
    const retryInput = super.getRetryInput();
    for (const taxTypeId of Object.keys(this.failures)) {
      const failure = this.failures[taxTypeId];
      if (failure.returns.length > 0) {
        set(retryInput, ['returns', taxTypeId], failure.returns);
      }
    }
    return retryInput;
  }
}

type DownloadItemsTaskTitleFn = (count: number) => string;

interface ReturnHistoryDownloadFnOptions {
  client: Client;
  taxType: TaxTypeNumericalCode;
  taxReturn: TaxReturn;
  parentTaskId: TaskId;
}

export type ReturnHistoryDownloadFn = (options: ReturnHistoryDownloadFnOptions) => Promise<void>;

interface ReturnHistoryDownloadRunnerConstructorOptions {
  downloadItemsTaskTitle: DownloadItemsTaskTitleFn;
  downloadTaxTypeTaskTitle: TaxTypeTaskTitleFn | null;
  downloadFunc: ReturnHistoryDownloadFn;
}

interface DownloadItemsFnOptions {
  returns: TaxReturn[];
  task: TaskObject;
  taxTypeId: TaxTypeNumericalCode;
}

export class ReturnHistoryDownloadRunner extends ReturnHistoryReturnDependentRunner {
  downloadItemsTaskTitle: (count: number) => string;

  downloadFunc: ReturnHistoryDownloadFn;

  // TODO: Decide if this action parameter is typed properly
  constructor(action: ClientActionObject<any, any>, {
    downloadItemsTaskTitle = () => '',
    downloadTaxTypeTaskTitle = null,
    downloadFunc = async () => { },
  }: ReturnHistoryDownloadRunnerConstructorOptions) {
    super(action);

    this.downloadItemsTaskTitle = downloadItemsTaskTitle;
    if (downloadTaxTypeTaskTitle !== null) {
      this.taxTypeTaskTitle = downloadTaxTypeTaskTitle;
    }
    this.downloadFunc = downloadFunc;

    this.returnDependentFunc = this.downloadItems;
  }

  /**
   * @returns Returns whose ack receipts or return forms could not be downloaded.
   */
  async downloadItems({ returns, task, taxTypeId }: DownloadItemsFnOptions): Promise<TaxReturn[]> {
    const taskTitle = this.downloadItemsTaskTitle(returns.length);
    task.status = taskTitle;
    const { client } = this.storeProxy;
    const downloadResponses = await downloadPages({
      taskTitle,
      list: returns,
      parentTaskId: task.id,
      downloadPageFn: (taxReturn, parentTaskId) => this.downloadFunc({
        taxReturn, parentTaskId, client, taxType: taxTypeId,
      }),
    });
    const failedReturns = getFailedResponseItems(downloadResponses);
    return failedReturns;
  }

  async runAllTaxTypes() {
    // TODO: Rename this to be generic
    await startDownloadingReceipts();
    await super.runAllTaxTypes();
    await finishDownloadingReceipts();
  }

  getRetryReasons() {
    const reasons = super.getRetryReasons();
    if (this.anyReturnsFailed()) {
      reasons.push('Some receipts failed to download');
    }
    return reasons;
  }
}
