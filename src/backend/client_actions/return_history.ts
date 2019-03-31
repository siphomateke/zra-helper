import moment from 'moment';
import set from 'lodash.set';
import store from '@/store';
import config from '@/transitional/config';
import createTask, { TaskObject } from '@/transitional/tasks';
import {
  taxTypes,
  TaxTypeNumericalCode,
  BrowserFeature,
  Date,
  TPIN,
  ReferenceNumber,
  TaxTypeIdMap,
} from '../constants';
import { getDocumentByAjax } from '../utils';
import { parseTableAdvanced } from '../content_scripts/helpers/zra';
import { parallelTaskMap, taskFunction, GetDataFromPageFunctionReturn } from './utils';
import {
  startDownloadingReceipts,
  finishDownloadingReceipts,
  downloadReceipts,
  getFailedResponseItems,
  getReceiptData,
  DownloadReceiptOptions,
} from './receipts';
import { createClientAction, ClientActionRunner, inInput } from './base';
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

const recordHeaders = [
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
];

interface GetAcknowledgementReceiptsReferenceNumbersFnOptions {
  tpin: TPIN;
  taxType: TaxTypeNumericalCode;
  fromDate: Date;
  toDate: Date;
  exciseType: ExciseType;
}

/**
 * Gets return history reference numbers that match the given criteria.
 */
async function getAcknowledgementReceiptsReferenceNumbers(
  page: number,
  {
    tpin,
    taxType,
    fromDate,
    toDate,
    exciseType,
  }: GetAcknowledgementReceiptsReferenceNumbersFnOptions
): Promise<GetDataFromPageFunctionReturn<ReferenceNumber[]>> {
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
    headers: recordHeaders,
    tableInfoSelector: '#ReturnHistoryForm>table:nth-child(8)>tbody>tr>td',
    recordSelector:
      '#ReturnHistoryForm>table.FORM_TAB_BORDER.marginStyle>tbody>tr.whitepapartd.borderlessInput',
    noRecordsString: 'No Data Found',
  });
  const referenceNumbers = [];
  for (const record of table.records) {
    if (record.appliedThrough.toLowerCase() === 'online') {
      referenceNumbers.push(record.referenceNo);
    }
  }
  return {
    numPages: table.numPages,
    value: referenceNumbers,
  };
}

interface GetDownloadReceiptOptions_Options {
  client: Client;
  taxType: TaxTypeNumericalCode;
  referenceNumber: ReferenceNumber;
  parentTaskId: number;
}
function getDownloadReceiptOptions({
  client,
  taxType,
  referenceNumber,
  parentTaskId,
}: GetDownloadReceiptOptions_Options): DownloadReceiptOptions {
  return {
    type: 'return',
    filename(receiptData) {
      const date = moment(receiptData.periodFrom, 'DD/MM/YYYY');
      let dateString = '';
      if (taxType === TaxTypeNumericalCode.ITX) {
        dateString = date.format('YYYY');
      } else {
        dateString = date.format('YYYY-MM');
      }
      return `receipt-${client.username}-${taxTypes[taxType]}-${dateString}-${referenceNumber}`;
    },
    taskTitle: `Download acknowledgement receipt ${referenceNumber}`,
    parentTaskId,
    createTabPostOptions: {
      url: 'https://www.zra.org.zm/retHist.htm',
      data: {
        actionCode: 'printReceipt',
        flag: 'rtnHistRcpt',
        ackNo: referenceNumber,
        rtnType: taxType,
      },
    },
  };
}

const GetAcknowledgementsOfReturnsClientAction = createClientAction({
  id: 'getAcknowledgementsOfReturns',
  name: 'Get acknowledgements of returns',
  requiredFeatures: [BrowserFeature.MHTML],
  requiresTaxTypes: true,
});

interface RunnerInput {
  fromDate: Date;
  toDate: Date;
  taxTypeIds: TaxTypeNumericalCode[];
  /** Reference numbers by tax type ID. */
  receipts: TaxTypeIdMap<ReferenceNumber[]>;
  /** Receipt data pages by tax type ID. */
  receiptDataPages: TaxTypeIdMap<number[]>;
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

interface GetReferenceNumbersFnOptions {
  task: TaskObject;
  taxTypeId: TaxTypeNumericalCode;
  pages: number[];
}

interface DownloadReceiptsFnOptions {
  referenceNumbers: string[];
  task: TaskObject;
  taxTypeId: TaxTypeNumericalCode;
}

interface TaxTypeFailure {
  receipts: ReferenceNumber[];
  receiptDataPages: number[];
}

type TaxTypeFailures = { [key: string]: TaxTypeFailure };

interface DownloadTaxTypeReceiptsFnOptions {
  taxTypeId: TaxTypeNumericalCode;
  parentTaskId: TaskId;
}

GetAcknowledgementsOfReturnsClientAction.Runner = class extends ClientActionRunner {
  constructor(data) {
    super(data);
    this.storeProxy.actionId = GetAcknowledgementsOfReturnsClientAction.id;
    this.storeProxy.input = {
      fromDate: '01/01/2013',
      toDate: moment().format('31/12/YYYY'),
    };
  }

  async getReferenceNumbers({ task, taxTypeId, pages }: GetReferenceNumbersFnOptions) {
    const { client } = this.storeProxy;
    // eslint-disable-next-line prefer-destructuring
    const input = /** @type {RunnerInput} */ (this.storeProxy.input);

    const response = await getReceiptData({
      parentTaskId: task.id,
      taskTitle: "Get acknowledgement receipts' reference numbers",
      getPageTaskTitle: page => `Getting reference numbers from page ${page}`,
      getDataFunction: page =>
        getAcknowledgementReceiptsReferenceNumbers(page, {
          tpin: client.username,
          taxType: taxTypeId,
          fromDate: input.fromDate,
          toDate: input.toDate,
          exciseType: ExciseType.Airtime,
        }),
      pages,
    });
    return {
      referenceNumbers: response.data,
      failedPages: response.failedPages,
    };
  }

  /**
   * @returns Reference numbers that could not be retrieved.
   */
  async downloadReceipts({
    referenceNumbers,
    task,
    taxTypeId,
  }: DownloadReceiptsFnOptions): Promise<ReferenceNumber[]> {
    const { client } = this.storeProxy;
    const downloadResponses = await downloadReceipts({
      taskTitle: `Download ${referenceNumbers.length} acknowledgement receipt(s)`,
      list: referenceNumbers,
      parentTaskId: task.id,
      getDownloadReceiptOptions(referenceNumber, parentTaskId) {
        return getDownloadReceiptOptions({
          referenceNumber,
          parentTaskId,
          client,
          taxType: taxTypeId,
        });
      },
    });
    const failedReferenceNumbers = getFailedResponseItems(downloadResponses);
    return failedReferenceNumbers;
  }

  /**
   * Downloads the receipts of a certain tax type.
   * @returns Any failures encountered downloading the receipts.
   */
  async downloadTaxTypeReceipts({
    taxTypeId,
    parentTaskId,
  }: DownloadTaxTypeReceiptsFnOptions): Promise<TaxTypeFailure> {
    // eslint-disable-next-line prefer-destructuring
    const input = /** @type {RunnerInput} */ (this.storeProxy.input);
    const taxType = taxTypes[taxTypeId];

    const failed: TaxTypeFailure = {
      receiptDataPages: [],
      receipts: [],
    };

    const task = await createTask(store, {
      title: `Get ${taxType} acknowledgement receipts`,
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

        let referenceNumbers: ReferenceNumber[] = [];
        // If only certain reference numbers failed in the last run, use those.
        const inputRefNumbers = getTaxTypeInput(
          {
            receipts: {
              '05': 3,
            },
          },
          'receipts',
          taxTypeId
        );
        if (Array.isArray(inputRefNumbers) && inputRefNumbers.length > 0) {
          referenceNumbers = inputRefNumbers;
        }
        let pages: number[] = [];
        // If getting certain receipt data pages failed last time, only get those pages.
        const inputPages = getTaxTypeInput(input, 'receiptDataPages', taxTypeId);
        if (Array.isArray(inputPages) && inputPages.length > 0) {
          pages = inputPages;
        }
        if (inputPages !== null || inputRefNumbers === null) {
          task.status = 'Getting reference numbers';
          const data = await this.getReferenceNumbers({ task, taxTypeId, pages });
          ({ failedPages } = data);
          referenceNumbers.push(...data.referenceNumbers);
        }

        let failedReferenceNumbers: ReferenceNumber[] = [];
        // TODO: Indicate why receipts weren't downloaded
        if (referenceNumbers.length > 0) {
          task.status = `Downloading ${referenceNumbers.length} receipt(s)`;
          failedReferenceNumbers = await this.downloadReceipts({
            referenceNumbers,
            task,
            taxTypeId,
          });
        }

        failed.receiptDataPages = failedPages;
        failed.receipts = failedReferenceNumbers;
      },
    });
    return failed;
  }

  async runInternal() {
    const { client, task: actionTask, config: actionConfig } = this.storeProxy;
    // eslint-disable-next-line prefer-destructuring
    const input = /** @type {RunnerInput} */ (this.storeProxy.input);

    let taxTypeIds = client.taxTypes;

    // Filter tax type IDs using input
    if (inInput(input, 'taxTypeIds')) {
      taxTypeIds = taxTypeIds.filter(id => input.taxTypeIds.includes(id));
    }
    const receiptsInInput = inInput(input, 'receipts');
    const receiptDataPagesInInput = inInput(input, 'receiptDataPages');
    if (receiptsInInput || receiptDataPagesInInput) {
      // Note: This array will have duplicate tax type IDs.
      const desiredTaxTypeIds: TaxTypeNumericalCode[] = [];
      if (receiptsInInput) {
        desiredTaxTypeIds.push(...Object.keys(input.receipts));
      }
      if (receiptDataPagesInInput) {
        desiredTaxTypeIds.push(...Object.keys(input.receiptDataPages));
      }
      taxTypeIds = taxTypeIds.filter(id => desiredTaxTypeIds.includes(id));
    }

    const failures: TaxTypeFailures = {};
    let anyFailures = false;

    const initialMaxOpenTabs = config.maxOpenTabs;
    config.maxOpenTabs = actionConfig.maxOpenTabsWhenDownloading;
    await startDownloadingReceipts();
    await parallelTaskMap({
      list: taxTypeIds,
      task: actionTask,
      func: async (taxTypeId, parentTaskId) => {
        const taxTypeFailure = await this.downloadTaxTypeReceipts({ taxTypeId, parentTaskId });
        failures[taxTypeId] = taxTypeFailure;
        if (taxTypeFailure.receiptDataPages.length > 0 || taxTypeFailure.receipts.length > 0) {
          anyFailures = true;
        }
      },
    });
    await finishDownloadingReceipts();
    config.maxOpenTabs = initialMaxOpenTabs;

    if (anyFailures) {
      this.setRetryReason('Some receipts failed to download.');
      const retryInput = {};
      for (const taxTypeId of Object.keys(failures)) {
        const failure = failures[taxTypeId];
        if (failure.receipts.length > 0) {
          set(retryInput, ['receipts', taxTypeId], failure.receipts);
        }
        if (failure.receiptDataPages.length > 0) {
          set(retryInput, ['receiptDataPages', taxTypeId], failure.receiptDataPages);
        }
      }
      this.storeProxy.retryInput = retryInput;
    }
  }
};

export default GetAcknowledgementsOfReturnsClientAction;
