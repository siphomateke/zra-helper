import moment from 'moment';
import store from '@/store';
import createTask from '@/transitional/tasks';
import { taskStates } from '@/store/modules/tasks';
import { taxTypes, taxTypeNumericalCodes } from '../constants';
import { TaxTypeNotFoundError } from '../errors';
import { getDocumentByAjax } from '../utils';
import { ClientAction } from './base';
import { parseTableAdvanced } from '../content_scripts/helpers/zra';
import { downloadReceipt, parallelTaskMap } from './utils';

const { config } = store.state;

/**
 * @typedef {import('../constants').Client} Client
 * @typedef {import('./base').Output} Output
 * @typedef {import('@/transitional/tasks').TaskObject} Task
 * @typedef {string} TPIN
 * @typedef {import('../constants').TaxTypeNumericalCode} TaxTypeNumericalCode
 * @typedef {import('../constants').Date} Date
 * @typedef {import('../constants').ReferenceNumber} ReferenceNumber
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

// TODO: Document functions

/**
 * Gets return history reference numbers that match the given criteria.
 * @param {Object} options
 * @param {TPIN} options.tpin
 * @param {TaxTypeNumericalCode} options.taxType
 * @param {Date} options.fromDate
 * @param {Date} options.toDate
 * @param {number} options.page
 * @param {ExciseTypeCode} options.exciseType
 * @returns {Promise.<import('../content_scripts/helpers/zra').ParsedTable>}
 * @throws {TaxTypeNotFoundError}
 */
async function getReturnHistoryReferenceNumbers({
  tpin, taxType, fromDate, toDate, page, exciseType,
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

  try {
    return await parseTableAdvanced({
      root: doc,
      headers: recordHeaders,
      tableInfoSelector: '#ReturnHistoryForm>table:nth-child(8)>tbody>tr>td',
      recordSelector: '#ReturnHistoryForm>table.FORM_TAB_BORDER.marginStyle>tbody>tr.whitepapartd.borderlessInput',
      noRecordsString: 'No Data Found',
    });
  } catch (error) {
    if (error.type === 'TableError' && error.code === 'NoRecordsFound') {
      throw new TaxTypeNotFoundError(`Tax type with id "${taxType}" not found`, null, {
        taxTypeId: taxType,
      });
    } else {
      throw error;
    }
  }
}

/**
 * Gets return history reference numbers from all the pages that match the given criteria.
 * @param {Object} options
 * @param {TPIN} options.tpin
 * @param {TaxTypeNumericalCode} options.taxType
 * @param {Date} options.fromDate
 * @param {Date} options.toDate
 * @param {ExciseTypeCode} options.exciseType
 * @param {number} options.parentTaskId
 * @returns {Promise.<ReferenceNumber[]>}
 */
async function getAllReturnHistoryReferenceNumbers({
  tpin, taxType, fromDate, toDate, exciseType, parentTaskId,
}) {
  const task = await createTask(store, {
    title: 'Get reference numbers',
    parent: parentTaskId,
    progressMax: 1,
    status: 'Getting reference numbers from first page',
  });

  let numPages = 1;
  /** @type {ReferenceNumber[]} */
  const referenceNumbers = [];
  try {
    // TODO: Consider doing this in parallel
    for (let page = 0; page < numPages; page++) {
      const result = await getReturnHistoryReferenceNumbers({
        tpin,
        taxType,
        fromDate,
        toDate,
        page: page + 1,
        exciseType,
      });

      if (page > 0) {
        task.addStep(`Getting reference numbers from page ${(page + 1)}/${numPages}`);
      } else {
        task.progress++;
      }

      for (const record of result.records) {
        if (record.appliedThrough.toLowerCase() === 'online') {
          referenceNumbers.push(record.referenceNo);
        }
      }

      if (result.numPages <= 1) {
        break;
      } else {
        numPages = result.numPages;
        task.progressMax = numPages;
      }
    }
    task.state = taskStates.SUCCESS;
    task.status = '';
  } catch (error) {
    task.setError(error);
    throw error;
  } finally {
    task.markAsComplete();
  }
  return referenceNumbers;
}

/**
 * Downloads the return history receipt that has the provided reference number.
 * @param {Object} options
 * @param {Client} options.client
 * @param {TaxTypeNumericalCode} options.taxType
 * @param {ReferenceNumber} options.referenceNumber
 * @param {number} options.parentTaskId
 */
function downloadReturnHistoryReceipt({
  client, taxType, referenceNumber, parentTaskId,
}) {
  return downloadReceipt({
    type: 'return',
    filename(receiptData) {
      const date = moment(receiptData.periodFrom, 'DD/MM/YYYY');
      let dateString = '';
      if (taxType === taxTypeNumericalCodes.ITX) {
        dateString = date.format('YYYY');
      } else {
        dateString = date.format('YYYY-MM');
      }
      return `receipt-${client.username}-${taxTypes[taxType]}-${dateString}-${referenceNumber}.mhtml`;
    },
    taskTitle: `Download receipt ${referenceNumber}`,
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
  });
}

/**
 * Downloads all the return history receipts that have the provided reference numbers.
 * @param {Object} options
 * @param {Client} options.client
 * @param {TaxTypeNumericalCode} options.taxType
 * @param {ReferenceNumber[]} options.referenceNumbers
 * @param {number} options.parentTaskId
 */
async function downloadReceipts({
  client, taxType, referenceNumbers, parentTaskId,
}) {
  const task = await createTask(store, { title: 'Download receipts', parent: parentTaskId });
  return parallelTaskMap({
    list: referenceNumbers,
    task,
    func(referenceNumber, parentTaskId) {
      return downloadReturnHistoryReceipt({
        client, taxType, referenceNumber, parentTaskId,
      });
    },
  });
}

export default new ClientAction(
  'Get all returns', 'getAllReturns',
  /**
   * @param {Client} client
   * @param {Task} parentTask
   */
  async (client, parentTask) => {
    const initialMaxOpenTabs = config.maxOpenTabs;
    config.maxOpenTabs = config.returnHistory.maxOpenTabsWhenDownloading;

    await parallelTaskMap({
      list: Object.keys(taxTypes),
      task: parentTask,
      autoCalculateTaskState: false,
      async func(taxTypeId, parentTaskId) {
        const taxType = taxTypes[taxTypeId];

        const task = await createTask(store, {
          title: `Get ${taxType} receipts`,
          parent: parentTaskId,
          unknownMaxProgress: false,
          progressMax: 2,
        });
        try {
          const referenceNumbers = await getAllReturnHistoryReferenceNumbers({
            tpin: client.username,
            taxType: taxTypeId,
            fromDate: '01/01/2013',
            toDate: moment().format('31/12/YYYY'),
            exciseType: exciseTypes.airtime,
            parentTaskId: task.id,
          });
          await downloadReceipts({
            taxType: taxTypeId,
            referenceNumbers,
            parentTaskId: task.id,
            client,
          });
          task.status = '';
          task.setStateBasedOnChildren();
        } catch (error) {
          task.setError(error);
        } finally {
          task.markAsComplete();
        }
      },
    });

    config.maxOpenTabs = initialMaxOpenTabs;

    let errorCount = 0;
    let taxTypeErrorCount = 0;
    for (const task of parentTask.children) {
      if (task.state === taskStates.ERROR) {
        if (task.error && task.error.type === 'TaxTypeNotFoundError') {
          taxTypeErrorCount++;
        } else {
          errorCount++;
        }
      }
    }
    if (errorCount > 0) {
      parentTask.state = taskStates.ERROR;
    } else if (taxTypeErrorCount === parentTask.children.length) {
      // If all sub tasks don't have a tax type, something probably went wrong
      parentTask.state = taskStates.WARNING;
      parentTask.status = 'No tax types found.';
    } else if (parentTask.childStateCounts[taskStates.WARNING] > 0) {
      parentTask.state = taskStates.WARNING;
    } else {
      parentTask.state = taskStates.SUCCESS;
    }
  },
);
