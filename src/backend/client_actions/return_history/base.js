import moment from 'moment';
import set from 'lodash.set';
import store from '@/store';
import createTask from '@/transitional/tasks';
import { taxTypes, taxTypeNumericalCodes } from '../../constants';
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
import { ClientActionRunner, inputExists, getInput } from '../base';

/**
 * @typedef {import('@/backend/constants').Client} Client
 * @typedef {import('@/backend/constants').TPIN} TPIN
 * @typedef {import('@/backend/constants').TaxTypeNumericalCode} TaxTypeNumericalCode
 * @typedef {import('@/backend/constants').Date} Date
 * @typedef {import('@/backend/constants').ReferenceNumber} ReferenceNumber
 * @typedef {import('@/transitional/tasks').TaskObject} TaskObject
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
 * @property {string} status Financial account status code with an asterisk at the end.
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
 * @typedef {Object} GetAllReturnHistoryRecordsFnOptions
 * @property {number} parentTaskId
 * @property {TPIN} tpin
 * @property {TaxTypeNumericalCode} taxTypeId
 * @property {Date} fromDate
 * @property {Date} toDate
 * @property {number[]} [pages]
 */

/**
 * Gets multiple pages of return history records within a certain time frame under a certain
 * tax type.
 * @param {GetAllReturnHistoryRecordsFnOptions} options
 */
export function getAllReturnHistoryRecords({
  parentTaskId,
  tpin,
  taxTypeId,
  fromDate,
  toDate,
  pages = [],
}) {
  return getReceiptData({
    parentTaskId,
    taskTitle: 'Get returns',
    getPageTaskTitle: page => `Getting returns from page ${page}`,
    getDataFunction: page => getReturnHistoryRecords(page, {
      tpin,
      taxType: taxTypeId,
      fromDate,
      toDate,
      exciseType: exciseTypes.airtime,
    }),
    pages,
  });
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
  requiresTaxTypes: true,
  defaultInput: () => ({
    taxTypeIds: Object.keys(taxTypes),
    fromDate: '01/01/2013',
    toDate: moment().format('31/12/YYYY'),
  }),
  inputValidation: {
    taxTypeIds: 'required|taxTypeIds',
    fromDate: 'required|date_format:dd/MM/yyyy|before:toDate,true',
    toDate: 'required|date_format:dd/MM/yyyy|after:fromDate,true',
  },
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
 * @typedef {Object} TaxTypeFailure
 * @property {TaxReturn[]} [returns]
 * @property {number[]} [returnHistoryPages]
 * @property {boolean} errorThrown
 * @property {boolean} failed
 */

/**
 * @typedef {Object.<string, TaxTypeFailure>} TaxTypeFailures
 */

/**
 * @typedef {(taxType: import('../../constants').TaxTypeCode) => string} TaxTypeTaskTitleFn
 */

/**
 * @typedef {Object} RunTaxTypeTaskFnOptions
 * @property {TaxTypeNumericalCode} taxTypeId
 * @property {number} parentTaskId
 * @property {RunnerInput} input
 * @property {TaxTypeFunc} taxTypeFunc Function to run on the tax type.
 */

export class ReturnHistoryRunner extends ClientActionRunner {
  constructor(action) {
    super(action);

    /** @type {TaxTypeTaskTitleFn} */
    this.taxTypeTaskTitle = () => '';

    /** @type {TaxTypeFailures} */
    this.failures = {};
    this.anyFailures = false;

    /**
     * @type {Object.<string, TaxReturn[]>}
     * Returns per tax type ID. Includes returns that are being retried.
     */
    this.taxTypeReturns = {};

    // TODO: Make sure the reason is always known.
    this.getUnknownRetryReasonMessage = () => 'Failed for unknown reason.';
  }

  /**
   * Stores the tax returns for a particular tax type.
   * @param {TaxTypeNumericalCode} taxTypeId
   * @param {TaxReturn[]} returns
   */
  addTaxTypesReturns(taxTypeId, returns) {
    if (!(taxTypeId in this.taxTypeReturns)) {
      this.taxTypeReturns[taxTypeId] = [];
    }
    this.taxTypeReturns[taxTypeId].push(...returns);
  }

  /**
   * @param {Object} options
   * @param {TaskObject} options.task
   * @param {TaxTypeNumericalCode} options.taxTypeId
   * @param {number[]} options.pages
   */
  async getReturnsInternal({ task, taxTypeId, pages }) {
    const { client } = this.storeProxy;
    // eslint-disable-next-line prefer-destructuring
    const input = /** @type {RunnerInput} */(this.storeProxy.input);

    const response = await getAllReturnHistoryRecords({
      parentTaskId: task.id,
      tpin: client.username,
      taxTypeId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      pages,
    });
    return {
      returns: response.data,
      failedPages: response.failedPages,
    };
  }

  /**
   * Gets tax returns using the action's input and stores any failed pages.
   * @param {Object} options
   * @param {TaskObject} options.task
   * @param {RunnerInput} options.input
   * @param {TaxTypeNumericalCode} options.taxTypeId
   * @param {TaxTypeFailure} options.failures
   */
  async getReturns({
    task, input, taxTypeId, failures,
  }) {
    // If getting certain return history pages failed last time, only get those pages.
    const { value: pages } = getInput(input, `returnHistoryPages.${taxTypeId}`, { defaultValue: [] });

    task.status = 'Getting returns';
    const returns = [];
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
   * @param {TaxTypeFailure} failures
   * @return {boolean}
   */
  // eslint-disable-next-line class-methods-use-this
  checkIfTaxTypeFailed(failures) {
    return failures.errorThrown || failures.returnHistoryPages.length > 0;
  }

  /**
   * @typedef {Object} TaxTypeFuncFnOptions
   * @property {TaxTypeFailure} failures
   * @property {RunnerInput} input
   * @property {TaskObject} task
   *
   * @callback TaxTypeFunc
   * @param {TaxTypeFuncFnOptions} options
   * @returns {Promise}
   */

  /**
   * Creates a task and runs the passed `taxTypeFunc` on a single tax type.
   * @param {RunTaxTypeTaskFnOptions} options
   * @returns {Promise.<TaxTypeFailure>} Any failures encountered.
   */
  async runTaxTypeTask({
    taxTypeId, parentTaskId, input, taxTypeFunc,
  }) {
    const taxType = taxTypes[taxTypeId];

    /** @type {TaxTypeFailure} */
    const failures = {
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

  /**
   * @param {Object} options
   * @param {TaxTypeNumericalCode} options.taxTypeId
   * @param {number} options.parentTaskId
   * @param {RunnerInput} options.input
   */
  getReturnsForTaxType({ taxTypeId, parentTaskId, input }) {
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
   * @param {Object} options
   * @param {TaxTypeNumericalCode} options.taxTypeId
   * @param {number} options.parentTaskId
   * @param {RunnerInput} options.input
   * @returns {Promise.<TaxTypeFailure>}
   */
  runTaxTypeTaskAbstract({ taxTypeId, parentTaskId, input }) {
    return this.getReturnsForTaxType({ taxTypeId, parentTaskId, input });
  }

  /**
   * Runs `runTaxTypeTaskAbstract` on every tax type and stores the failures.
   */
  async runAllTaxTypes() {
    const { client, task } = this.storeProxy;
    // We get the input here once to reduce the overhead from querying Vuex.
    /** @type {{input: RunnerInput}} */
    const { input } = this.storeProxy;

    let taxTypeIds = client.taxTypes;

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

  /**
   * @returns {string[]}
   */
  getRetryReasons() {
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

  getRetryInput() {
    const retryInput = {
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

/**
 * @typedef TaxTypeRunInfo
 * @property {RunnerInput} input
 * @property {TaxTypeNumericalCode} taxTypeId
 *
 * @callback ShouldRunReturnDependentFuncOnTaxTypeFn
 * @param {TaxTypeRunInfo} options
 * @returns {boolean}
 */

/**
 * @callback TaxTypeTaskProgressMaxFn
 * @param {TaxTypeRunInfo} options
 * @returns {number}
 */

/**
 * @typedef ReturnDependentFnOptions
 * @property {RunnerInput} input
 * @property {TaxReturn[]} returns
 * @property {TaskObject} task
 * @property {TaxTypeNumericalCode} taxTypeId
 *
 * @callback ReturnDependentFn
 * @param {ReturnDependentFnOptions} options
 * @returns {Promise.<TaxReturn[]>}
 * Any tax returns that the dependent function failed to run on and should be retried.
 */

/**
 * @typedef AbstractTaxTypeFuncOptions
 * @property {TaskObject} task
 * @property {RunnerInput} input
 * @property {TaxTypeNumericalCode} taxTypeId
 * @property {TaxTypeFailure} failures
 *
 * @callback AbstractTaxTypeFunc
 * @param {AbstractTaxTypeFuncOptions} options
 * @returns {Promise.<any>}
 */

/**
 * Runs an extra step on each collected tax return.
 *
 * When extending this class, make sure to give a message for returns failing by extending
 * `getRetryReasons`.
 * @abstract
 */
export class ReturnHistoryReturnDependentRunner extends ReturnHistoryRunner {
  /**
   * @param {import('../base').ClientActionObject} action
   */
  constructor(action) {
    super(action);

    /**
     * @type {ShouldRunReturnDependentFuncOnTaxTypeFn}
     * Function that decides whether the function that depends on returns should be run on a
     * particular tax type.
     */
    this.shouldRunReturnDependentFuncOnTaxType = () => true;
    /**
     * @type {TaxTypeTaskProgressMaxFn}
     * Maximum progress for the task run on each tax type.
     */
    this.taxTypeTaskProgressMax = ({ input, taxTypeId }) => {
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
     * @type {ReturnDependentFn}
     */
    this.returnDependentFunc = null;
    /**
     * Function to be run on each tax type.
     * @type {AbstractTaxTypeFunc}
     */
    this.taxTypeFunc = null;
  }

  /**
   * Gets all tax returns, or those that failed or were from pages that failed in the previous run.
   *
   * Calls `addTaxTypesReturns` to add the retrieved tax returns.
   * @param {Object} options
   * @param {TaskObject} options.task
   * @param {RunnerInput} options.input
   * @param {TaxTypeNumericalCode} options.taxTypeId
   * @param {TaxTypeFailure} options.failures
   */
  async getReturnsSmart({
    task, input, taxTypeId, failures,
  }) {
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

  /**
   * @param {TaxTypeFailure} failures
   * @return {boolean}
   */
  checkIfTaxTypeFailed(failures) {
    return super.checkIfTaxTypeFailed(failures)
      || failures.returns.length > 0;
  }

  async runTaxTypeTaskAbstract({ input, taxTypeId, parentTaskId }) {
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

export class ReturnHistoryDownloadRunner extends ReturnHistoryReturnDependentRunner {
  /**
   * @param {import('../base').ClientActionObject} action
   * @param {Object} options
   * @param {(count: number) => string} options.downloadItemsTaskTitle
   * @param {TaxTypeTaskTitleFn} options.downloadTaxTypeTaskTitle
   * @param {ReturnHistoryDownloadFn} options.downloadFunc
   */
  constructor(action, {
    downloadItemsTaskTitle = () => '',
    downloadTaxTypeTaskTitle = null,
    downloadFunc = () => { },
  }) {
    super(action);

    this.downloadItemsTaskTitle = downloadItemsTaskTitle;
    if (downloadTaxTypeTaskTitle !== null) {
      this.taxTypeTaskTitle = downloadTaxTypeTaskTitle;
    }
    this.downloadFunc = downloadFunc;

    this.returnDependentFunc = this.downloadItems;
  }

  /**
   * @param {Object} options
   * @param {TaxReturn[]} options.returns
   * @param {TaskObject} options.task
   * @param {TaxTypeNumericalCode} options.taxTypeId
   * @returns {Promise.<TaxReturn[]>}
   * Returns whose ack receipts or return forms could not be downloaded.
   */
  async downloadItems({ returns, task, taxTypeId }) {
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
