import moment from 'moment';
import set from 'lodash.set';
import store from '@/store';
import createTask from '@/transitional/tasks';
import { taxTypes, taxTypeNumericalCodes, browserFeatures } from '../constants';
import { getDocumentByAjax } from '../utils';
import { parseTableAdvanced } from '../content_scripts/helpers/zra';
import {
  parallelTaskMap,
  taskFunction,
} from './utils';
import {
  startDownloadingReceipts,
  finishDownloadingReceipts,
  downloadReceipts,
  getFailedResponseItems,
  getReceiptData,
} from './receipts';
import { createClientAction, ClientActionRunner, inInput } from './base';

/**
 * @typedef {import('../constants').Client} Client
 * @typedef {string} TPIN
 * @typedef {import('../constants').TaxTypeNumericalCode} TaxTypeNumericalCode
 * @typedef {import('../constants').Date} Date
 * @typedef {import('../constants').ReferenceNumber} ReferenceNumber
 */

/**
 * @template R
 * @typedef {import('./utils').GetDataFromPageFunctionReturn<R>} GetDataFromPageFunctionReturn
 */

/**
 * @typedef {string} ExciseType
 * Excise type name. For example, 'airtime' and 'electricalEnergy'.
 */

/**
 * @typedef {string} ExciseTypeCode
 * Excise type numerical code. For example, '20025012' (airtime) and '20025007' (electricalEnergy).
 */

/** @type {Object.<ExciseType, ExciseTypeCode>} */
const exciseTypes = {
  airtime: '20025012',
  electricalEnergy: '20025007',
  opaqueBeer: '20025011',
  otherThanOpaqueBeer: '20025008',
  fuelTerminal: '20025010',
  spiritsAndWine: '20025009',
};

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

/**
 * @typedef {Object} GetReferenceNumbersOptions
 * @property {TPIN} tpin
 * @property {TaxTypeNumericalCode} taxType
 * @property {Date} fromDate
 * @property {Date} toDate
 * @property {ExciseTypeCode} exciseType
 */

/**
 * Gets return history reference numbers that match the given criteria.
 * @param {number} page
 * @param {GetReferenceNumbersOptions} options
 * @returns {Promise.<GetDataFromPageFunctionReturn<ReferenceNumber[]>>}
 */
async function getAcknowledgementReceiptsReferenceNumbers(page, {
  tpin,
  taxType,
  fromDate,
  toDate,
  exciseType,
}) {
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
    recordSelector: '#ReturnHistoryForm>table.FORM_TAB_BORDER.marginStyle>tbody>tr.whitepapartd.borderlessInput',
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

/**
 * @param {Object} options
 * @param {Client} options.client
 * @param {TaxTypeNumericalCode} options.taxType
 * @param {ReferenceNumber} options.referenceNumber
 * @param {number} options.parentTaskId
 * @returns {import('./receipts').DownloadReceiptOptions}
 */
function getDownloadReceiptOptions({
  client, taxType, referenceNumber, parentTaskId,
}) {
  return {
    type: 'return',
    filename(receiptData) {
      const date = moment(receiptData.periodFrom, 'DD/MM/YYYY');
      let dateString = '';
      if (taxType === taxTypeNumericalCodes.ITX) {
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
  requiredFeatures: [browserFeatures.MHTML],
  requiresTaxTypes: true,
});

/**
 * @typedef {Object} RunnerInput
 * @property {import('@/backend/constants').Date} [fromDate]
 * @property {import('@/backend/constants').Date} [toDate]
 * @property {TaxTypeNumericalCode[]} [taxTypeIds]
 * @property {Object.<string, ReferenceNumber[]>} [receipts] Reference numbers by tax type ID.
 * @property {Object.<string, number[]>} [receiptDataPages] Receipt data pages by tax type ID.
 */

/**
 * Gets input that is only used under a particular tax type.
 * @param {Object} input
 * @param {TaxTypeNumericalCode} taxTypeId
 * @param {string} key
 * @returns {Array}
 */
function getTaxTypeInput(input, taxTypeId, key) {
  if (inInput(input, key)) {
    return input[key][taxTypeId];
  }
  return null;
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

  /**
   * @param {Object} options
   * @param {import('@/transitional/tasks').TaskObject} options.task
   * @param {TaxTypeNumericalCode} options.taxTypeId
   * @param {number[]} options.pages
   */
  async getReferenceNumbers({ task, taxTypeId, pages }) {
    const { client } = this.storeProxy;
    // eslint-disable-next-line prefer-destructuring
    const input = /** @type {RunnerInput} */(this.storeProxy.input);

    const response = await getReceiptData({
      parentTaskId: task.id,
      taskTitle: "Get acknowledgement receipts' reference numbers",
      getPageTaskTitle: page => `Getting reference numbers from page ${page}`,
      getDataFunction: page => getAcknowledgementReceiptsReferenceNumbers(page, {
        tpin: client.username,
        taxType: taxTypeId,
        fromDate: input.fromDate,
        toDate: input.toDate,
        exciseType: exciseTypes.airtime,
      }),
      pages,
    });
    return {
      referenceNumbers: response.data,
      failedPages: response.failedPages,
    };
  }

  /**
   * @param {Object} options
   * @param {string[]} options.referenceNumbers
   * @param {import('@/transitional/tasks').TaskObject} options.task
   * @param {TaxTypeNumericalCode} options.taxTypeId
   * @returns {Promise.<ReferenceNumber[]>} Reference numbers that could not be retrieved.
   */
  async downloadReceipts({ referenceNumbers, task, taxTypeId }) {
    const { client } = this.storeProxy;
    const downloadResponses = await downloadReceipts({
      taskTitle: `Download ${referenceNumbers.length} acknowledgement receipt(s)`,
      list: referenceNumbers,
      parentTaskId: task.id,
      getDownloadReceiptOptions(referenceNumber, parentTaskId) {
        return getDownloadReceiptOptions({
          referenceNumber, parentTaskId, client, taxType: taxTypeId,
        });
      },
    });
    const failedReferenceNumbers = getFailedResponseItems(downloadResponses);
    return failedReferenceNumbers;
  }

  /**
  * @typedef {Object} TaxTypeFailure
  * @property {ReferenceNumber[]} [receipts]
  * @property {number[]} [receiptDataPages]
  */

  /**
   * @typedef {Object.<string, TaxTypeFailure>} TaxTypeFailures
   */

  /**
   * Downloads the receipts of a certain tax type.
   * @param {Object} options
   * @param {TaxTypeNumericalCode} options.taxTypeId
   * @param {number} options.parentTaskId
   * @returns {Promise.<TaxTypeFailure>} Any failures encountered downloading the receipts.
   */
  async downloadTaxTypeReceipts({ taxTypeId, parentTaskId }) {
    // eslint-disable-next-line prefer-destructuring
    const input = /** @type {RunnerInput} */(this.storeProxy.input);
    const taxType = taxTypes[taxTypeId];

    /** @type {TaxTypeFailure} */
    const failed = {
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
        let failedPages = [];

        let referenceNumbers = [];
        // If only certain reference numbers failed in the last run, use those.
        const inputRefNumbers = getTaxTypeInput(input, taxTypeId, 'receipts');
        if (Array.isArray(inputRefNumbers) && inputRefNumbers.length > 0) {
          referenceNumbers = inputRefNumbers;
        }
        let pages = [];
        // If getting certain receipt data pages failed last time, only get those pages.
        const inputPages = getTaxTypeInput(input, taxTypeId, 'receiptDataPages');
        if (Array.isArray(inputPages) && inputPages.length > 0) {
          pages = inputPages;
        }
        if (inputPages !== null || inputRefNumbers === null) {
          task.status = 'Getting reference numbers';
          const data = await this.getReferenceNumbers({ task, taxTypeId, pages });
          ({ failedPages } = data);
          referenceNumbers.push(...data.referenceNumbers);
        }

        let failedReferenceNumbers = [];
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
    const { client, task: actionTask } = this.storeProxy;
    // eslint-disable-next-line prefer-destructuring
    const input = /** @type {RunnerInput} */(this.storeProxy.input);

    let taxTypeIds = client.taxTypes;

    // Filter tax type IDs using input
    if (inInput(input, 'taxTypeIds')) {
      taxTypeIds = taxTypeIds.filter(id => input.taxTypeIds.includes(id));
    }
    const receiptsInInput = inInput(input, 'receipts');
    const receiptDataPagesInInput = inInput(input, 'receiptDataPages');
    if (receiptsInInput || receiptDataPagesInInput) {
      // Note: This array will have duplicate tax type IDs.
      const desiredTaxTypeIds = [];
      if (receiptsInInput) {
        desiredTaxTypeIds.push(...Object.keys(input.receipts));
      }
      if (receiptDataPagesInInput) {
        desiredTaxTypeIds.push(...Object.keys(input.receiptDataPages));
      }
      taxTypeIds = taxTypeIds.filter(id => desiredTaxTypeIds.includes(id));
    }

    /** @type {TaxTypeFailures} */
    const failures = {};
    let anyFailures = false;

    await startDownloadingReceipts();
    await parallelTaskMap({
      list: taxTypeIds,
      task: actionTask,
      func: async (taxTypeId, parentTaskId) => {
        const taxTypeFailure = await this.downloadTaxTypeReceipts({ taxTypeId, parentTaskId });
        failures[taxTypeId] = taxTypeFailure;
        if (
          taxTypeFailure.receiptDataPages.length > 0
          || taxTypeFailure.receipts.length > 0
        ) {
          anyFailures = true;
        }
      },
    });
    await finishDownloadingReceipts();

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
