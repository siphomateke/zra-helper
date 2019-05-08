import moment from 'moment';
import set from 'lodash.set';
import store from '@/store';
import createTask from '@/transitional/tasks';
import { taxTypes, taxTypeNumericalCodes, browserFeatures } from '../../constants';
import { getDocumentByAjax } from '../../utils';
import { parseTableAdvanced } from '../../content_scripts/helpers/zra';
import {
  parallelTaskMap,
  taskFunction,
  downloadPages,
} from '../utils';
import {
  startDownloadingReceipts,
  finishDownloadingReceipts,
  getFailedResponseItems,
  getReceiptData,
} from '../receipts';
import { ClientActionRunner, inInput } from '../base';

/**
 * @typedef {import('@/backend/constants').Client} Client
 * @typedef {string} TPIN
 * @typedef {import('@/backend/constants').TaxTypeNumericalCode} TaxTypeNumericalCode
 * @typedef {import('@/backend/constants').Date} Date
 * @typedef {import('@/backend/constants').ReferenceNumber} ReferenceNumber
 */

/**
 * @template R
 * @typedef {import('../utils').GetDataFromPageFunctionReturn<R>} GetDataFromPageFunctionReturn
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
 * @typedef {Object} TaxReturn
 * @property {string} srNo
 * @property {ReferenceNumber} referenceNo
 * @property {string} searchCode
 * @property {string} returnPeriodFrom
 * @property {string} returnPeriodTo
 * @property {string} returnAppliedDate
 * @property {string} accountName
 * @property {string} applicationType
 * @property {string} status
 * @property {string} appliedThrough
 * @property {string} receipt
 * @property {string} submittedForm
 */

/**
 * @typedef {Object} GetReturnHistoryRecordsFnOptions
 * @property {TPIN} tpin
 * @property {TaxTypeNumericalCode} taxType
 * @property {Date} fromDate
 * @property {Date} toDate
 * @property {ExciseTypeCode} exciseType
 */

/**
 * Gets return history records that match the given criteria.
 * @param {number} page
 * @param {GetReturnHistoryRecordsFnOptions} options
 * @returns {Promise.<GetDataFromPageFunctionReturn<TaxReturn[]>>}
 */
async function getReturnHistoryRecords(page, {
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
  let { records } = table;
  records = records.filter(record => record.appliedThrough.toLowerCase() === 'online');
  return {
    numPages: table.numPages,
    value: records,
  };
}

/**
 * @param {Object} options
 * @param {string} options.type
 * @param {Client} options.client
 * @param {TaxTypeNumericalCode} options.taxType
 * @param {TaxReturn} options.taxReturn
 */
export function generateDownloadFilename({
  type, client, taxType, taxReturn,
}) {
  const date = moment(taxReturn.returnPeriodFrom, 'DD/MM/YYYY');
  let dateString = '';
  if (taxType === taxTypeNumericalCodes.ITX) {
    dateString = date.format('YYYY');
  } else {
    dateString = date.format('YYYY-MM');
  }
  return `${type}-${client.username}-${taxTypes[taxType]}-${dateString}-${taxReturn.referenceNo}`;
}

/**
 * @typedef ReturnHistoryDownloadFnOptions
 * @property {Client} client
 * @property {TaxTypeNumericalCode} taxType
 * @property {TaxReturn} taxReturn
 * @property {number} parentTaskId
 */

/**
 * @callback ReturnHistoryDownloadFn
 * @param {ReturnHistoryDownloadFnOptions} options
 */

export const GetReturnHistoryClientActionOptions = {
  requiredFeatures: [browserFeatures.MHTML],
  requiresTaxTypes: true,
  defaultInput: () => ({
    taxTypeIds: Object.keys(taxTypes),
    fromDate: '01/01/2013',
    toDate: moment().format('31/12/YYYY'),
  }),
};

/**
 * @typedef {Object} RunnerInput
 * @property {import('@/backend/constants').Date} [fromDate]
 * @property {import('@/backend/constants').Date} [toDate]
 * @property {TaxTypeNumericalCode[]} [taxTypeIds]
 * @property {Object.<string, TaxReturn[]>} [returns] Returns by tax type ID.
 * @property {Object.<string, number[]>} [returnHistoryPages] Return history pages by tax type ID.
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

export class ReturnHistoryRunner extends ClientActionRunner {
  constructor(data, action) {
    super(data, action);

    /** @type {(count: number) => string} */
    this.downloadItemsTaskTitle = () => '';
    /** @type {(taxType: import('../../constants').TaxTypeCode) => string} */
    this.downloadTaxTypeTaskTitle = () => '';
    /** @type {ReturnHistoryDownloadFn} */
    this.downloadFunc = () => { };
  }

  /**
   * @param {Object} options
   * @param {import('@/transitional/tasks').TaskObject} options.task
   * @param {TaxTypeNumericalCode} options.taxTypeId
   * @param {number[]} options.pages
   */
  async getReturns({ task, taxTypeId, pages }) {
    const { client } = this.storeProxy;
    // eslint-disable-next-line prefer-destructuring
    const input = /** @type {RunnerInput} */(this.storeProxy.input);

    const response = await getReceiptData({
      parentTaskId: task.id,
      taskTitle: 'Get returns',
      getPageTaskTitle: page => `Getting returns from page ${page}`,
      getDataFunction: page => getReturnHistoryRecords(page, {
        tpin: client.username,
        taxType: taxTypeId,
        fromDate: input.fromDate,
        toDate: input.toDate,
        exciseType: exciseTypes.airtime,
      }),
      pages,
    });
    return {
      returns: response.data,
      failedPages: response.failedPages,
    };
  }

  /**
   * @param {Object} options
   * @param {TaxReturn[]} options.returns
   * @param {import('@/transitional/tasks').TaskObject} options.task
   * @param {TaxTypeNumericalCode} options.taxTypeId
   * @returns {Promise.<TaxReturn[]>}
   * Returns whose ack receipts or return forms could not be downloaded.
   */
  async downloadItems({ returns, task, taxTypeId }) {
    const { client } = this.storeProxy;
    const downloadResponses = await downloadPages({
      taskTitle: this.downloadItemsTaskTitle(returns.length),
      list: returns,
      parentTaskId: task.id,
      downloadPageFn: (taxReturn, parentTaskId) => this.downloadFunc({
        taxReturn, parentTaskId, client, taxType: taxTypeId,
      }),
    });
    const failedReturns = getFailedResponseItems(downloadResponses);
    return failedReturns;
  }

  /**
  * @typedef {Object} TaxTypeFailure
  * @property {TaxReturn[]} [returns]
  * @property {number[]} [returnHistoryPages]
  * @property {boolean} failed
  */

  /**
   * @typedef {Object.<string, TaxTypeFailure>} TaxTypeFailures
   */

  /**
   * Downloads the ack receipts or returns of a certain tax type.
   * @param {Object} options
   * @param {TaxTypeNumericalCode} options.taxTypeId
   * @param {number} options.parentTaskId
   * @returns {Promise.<TaxTypeFailure>} Any failures encountered downloading the items.
   */
  async downloadTaxTypeItems({ taxTypeId, parentTaskId }) {
    // eslint-disable-next-line prefer-destructuring
    const input = /** @type {RunnerInput} */(this.storeProxy.input);
    const taxType = taxTypes[taxTypeId];

    /** @type {TaxTypeFailure} */
    const failures = {
      returnHistoryPages: [],
      returns: [],
      failed: false,
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
        try {
          let returns = [];
          // If only certain returns failed in the last run, use those.
          const inputReturns = getTaxTypeInput(input, taxTypeId, 'returns');
          if (Array.isArray(inputReturns) && inputReturns.length > 0) {
            returns = inputReturns;
          }
          let pages = [];
          // If getting certain return history pages failed last time, only get those pages.
          const inputPages = getTaxTypeInput(input, taxTypeId, 'returnHistoryPages');
          if (Array.isArray(inputPages) && inputPages.length > 0) {
            pages = inputPages;
          }
          if (Array.isArray(inputPages) || !Array.isArray(inputReturns)) {
            task.status = 'Getting returns';
            try {
              const data = await this.getReturns({ task, taxTypeId, pages });
              failures.returnHistoryPages = data.failedPages;
              returns.push(...data.returns);
            } catch (error) {
              if (pages.length > 0) {
                // If a specific page was specified but failed, then an error was thrown
                // and we must manually set `returnHistoryPages`
                failures.returnHistoryPages = pages;
              }
              throw error;
            }
          }

          // TODO: Indicate why items weren't downloaded
          if (returns.length > 0) {
            task.status = this.downloadItemsTaskTitle(returns.length);
            failures.returns = await this.downloadItems({
              returns,
              task,
              taxTypeId,
            });
          }
        } catch (error) {
          failures.failed = true;
          throw error;
        } finally {
          if (failures.returnHistoryPages.length > 0 || failures.returns.length > 0) {
            failures.failed = true;
          }
        }
      },
    });
    return failures;
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

    /** @type {TaxTypeFailures} */
    const failures = {};
    let anyFailures = false;

    try {
      // TODO: Rename this to be generic
      await startDownloadingReceipts();
      await parallelTaskMap({
        list: taxTypeIds,
        task: actionTask,
        func: async (taxTypeId, parentTaskId) => {
          const taxTypeFailure = await this.downloadTaxTypeItems({ taxTypeId, parentTaskId });
          if (taxTypeFailure.failed) {
            failures[taxTypeId] = taxTypeFailure;
            anyFailures = true;
          }
        },
      });
      await finishDownloadingReceipts();
    } finally {
      if (anyFailures) {
        this.setRetryReason('Some receipts failed to download.');
        const retryInput = {
          taxTypeIds: [],
        };
        for (const taxTypeId of Object.keys(failures)) {
          const failure = failures[taxTypeId];
          if (failure.returns.length > 0) {
            set(retryInput, ['returns', taxTypeId], failure.returns);
          }
          if (failure.returnHistoryPages.length > 0) {
            set(retryInput, ['returnHistoryPages', taxTypeId], failure.returnHistoryPages);
          }
          retryInput.taxTypeIds.push(taxTypeId);
        }
        this.storeProxy.retryInput = retryInput;
      }
    }
  }
}
