import moment from 'moment';
import set from 'lodash.set';
import store from '@/store';
import createTask, { TaskObject } from '@/transitional/tasks';
import {
  taxTypes,
  TaxTypeNumericalCode,
  BrowserFeature,
  ReferenceNumber,
  TPIN,
  Client,
  TaxTypeIdMap,
  TaxTypeCode,
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
  ClientActionRunner, inInput, BasicRunnerOutput, BasicRunnerConfig,
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

interface TaxReturn {
  srNo: string;
  referenceNo: ReferenceNumber;
  searchCode: string;
  returnPeriodFrom: string;
  returnPeriodTo: string;
  returnAppliedDate: string;
  accountName: string;
  applicationType: string;
  status: string;
  appliedThrough: string;
  receipt: string;
  submittedForm: string;
}

interface GetReturnHistoryRecordsFnOptions {
  tpin: TPIN;
  taxType: TaxTypeNumericalCode;
  fromDate: Date;
  toDate: Date;
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

interface ReturnHistoryDownloadFnOptions {
  client: Client;
  taxType: TaxTypeNumericalCode;
  taxReturn: TaxReturn;
  parentTaskId: number;
}

// FIXME: Add correct return type
export type ReturnHistoryDownloadFn = (options: ReturnHistoryDownloadFnOptions) => any;

export const GetReturnHistoryClientActionOptions = {
  requiredFeatures: [BrowserFeature.MHTML],
  requiresTaxTypes: true,
  defaultInput: () => ({
    fromDate: '01/01/2013',
    toDate: moment().format('31/12/YYYY'),
  }),
};

interface RunnerInput {
  fromDate?: Date;
  toDate?: Date;
  taxTypeIds?: TaxTypeNumericalCode[];
  /** Returns by tax type ID. */
  returns?: TaxTypeIdMap<TaxReturn[]>;
  /** Return history pages by tax type ID. */
  returnHistoryPages?: TaxTypeIdMap<number[]>;
}
/**
 * Gets input that is only used under a particular tax type.
 */
// FIXME: Fix these types
type InputWithTaxTypesKeys<R> = { [key: string]: TaxTypeIdMap<R> };
function getTaxTypeInput<
  R,
  I extends InputWithTaxTypesKeys<R>,
  K extends keyof I,
  T extends TaxTypeNumericalCode
>(input: I, key: K, taxTypeId: T): R {
  if (inInput(input, key)) {
    return input[key][taxTypeId];
  }
  return null;
}

interface GetReturnsFnOptions {
  task: TaskObject;
  taxTypeId: TaxTypeNumericalCode;
  pages: number[];
}

interface DownloadItemsFnOptions {
  returns: TaxReturn[];
  task: TaskObject;
  taxTypeId: TaxTypeNumericalCode;
}

interface TaxTypeFailure {
  returns: TaxReturn[];
  returnHistoryPages: number[];
}

type TaxTypeFailures = { [key: string]: TaxTypeFailure };

interface DownloadTaxTypeReceiptsFnOptions {
  taxTypeId: TaxTypeNumericalCode;
  parentTaskId: TaskId;
}

export class ReturnHistoryRunner extends ClientActionRunner<
  RunnerInput,
  BasicRunnerOutput,
  BasicRunnerConfig
  > {
  downloadItemsTaskTitle: (count: number) => string = () => '';

  downloadTaxTypeTaskTitle: (taxType: TaxTypeCode) => string = () => '';

  downloadFunc: ReturnHistoryDownloadFn = () => { };

  async getReturns({ task, taxTypeId, pages }: GetReturnsFnOptions) {
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
   * Returns whose ack receipts or return forms could not be downloaded.
   */
  async downloadItems({ returns, task, taxTypeId }: DownloadItemsFnOptions): Promise<TaxReturn[]> {
    const { client } = this.storeProxy;
    const downloadResponses = await downloadPages({
      taskTitle: this.downloadItemsTaskTitle(returns.length),
      list: returns,
      parentTaskId: task.id,
      downloadPageFn: (taxReturn, parentTaskId) => this.downloadFunc({
        taxReturn,
        parentTaskId,
        client,
        taxType: taxTypeId,
      }),
    });
    const failedReturns = getFailedResponseItems(downloadResponses);
    return failedReturns;
  }

  /**
   * Downloads the ack receipts or returns of a certain tax type.
   * @returns Any failures encountered downloading the items.
   */
  async downloadTaxTypeItems({
    taxTypeId,
    parentTaskId,
  }: DownloadTaxTypeReceiptsFnOptions): Promise<TaxTypeFailure> {
    const { input } = this.storeProxy;
    const taxType = taxTypes[taxTypeId];

    const failed: TaxTypeFailure = {
      returnHistoryPages: [],
      returns: [],
    };

    const task = await createTask(store, {
      title: this.downloadTaxTypeTaskTitle(taxType),
      parent: parentTaskId,
      unknownMaxProgress: false,
      progressMax: 2,
    });
    await taskFunction({
      task,
      catchErrors: true,
      setStateBasedOnChildren: true,
      func: async () => {
        let failedPages: number[] = [];

        let returns: TaxReturn[] = [];
        // If only certain returns failed in the last run, use those.
        const inputReturns = getTaxTypeInput(input, taxTypeId, 'returns');
        if (Array.isArray(inputReturns) && inputReturns.length > 0) {
          returns = inputReturns;
        }
        let pages: number[] = [];
        // If getting certain return history pages failed last time, only get those pages.
        const inputPages = getTaxTypeInput(input, taxTypeId, 'returnHistoryPages');
        if (Array.isArray(inputPages) && inputPages.length > 0) {
          pages = inputPages;
        }
        if (inputPages !== null || inputReturns === null) {
          task.status = 'Getting returns';
          const data = await this.getReturns({ task, taxTypeId, pages });
          ({ failedPages } = data);
          returns.push(...data.returns);
        }

        let failedReturns: TaxReturn[] = [];
        // TODO: Indicate why items weren't downloaded
        if (returns.length > 0) {
          task.status = this.downloadItemsTaskTitle(returns.length);
          failedReturns = await this.downloadItems({
            returns,
            task,
            taxTypeId,
          });
        }

        failed.returnHistoryPages = failedPages;
        failed.returns = failedReturns;
      },
    });
    return failed;
  }

  async runInternal() {
    const { client, task: actionTask, input } = this.storeProxy;

    let taxTypeIds = client.taxTypes;

    // Filter tax type IDs using input
    if (inInput(input, 'taxTypeIds')) {
      taxTypeIds = taxTypeIds.filter(id => input.taxTypeIds.includes(id));
    }
    const returnsInInput = inInput(input, 'returns');
    const returnHistoryPagesInInput = inInput(input, 'returnHistoryPages');
    if (returnsInInput || returnHistoryPagesInInput) {
      // Note: This array will have duplicate tax type IDs.
      const desiredTaxTypeIds: TaxTypeNumericalCode[] = [];
      if (returnsInInput) {
        desiredTaxTypeIds.push(...Object.keys(input.returns));
      }
      if (returnHistoryPagesInInput) {
        desiredTaxTypeIds.push(...Object.keys(input.returnHistoryPages));
      }
      taxTypeIds = taxTypeIds.filter(id => desiredTaxTypeIds.includes(id));
    }

    const failures: TaxTypeFailures = {};
    let anyFailures = false;

    // TODO: Rename this to be generic
    await startDownloadingReceipts();
    await parallelTaskMap({
      list: taxTypeIds,
      task: actionTask,
      func: async (taxTypeId, parentTaskId) => {
        const taxTypeFailure = await this.downloadTaxTypeItems({ taxTypeId, parentTaskId });
        failures[taxTypeId] = taxTypeFailure;
        if (taxTypeFailure.returnHistoryPages.length > 0 || taxTypeFailure.returns.length > 0) {
          anyFailures = true;
        }
      },
    });
    await finishDownloadingReceipts();

    if (anyFailures) {
      this.setRetryReason('Some receipts failed to download.');
      const retryInput: RunnerInput = {};
      for (const taxTypeId of Object.keys(failures)) {
        const failure = failures[taxTypeId];
        if (failure.returns.length > 0) {
          set(retryInput, ['returns', taxTypeId], failure.returns);
        }
        if (failure.returnHistoryPages.length > 0) {
          set(retryInput, ['returnHistoryPages', taxTypeId], failure.returnHistoryPages);
        }
      }
      this.storeProxy.retryInput = retryInput;
    }
  }
}
