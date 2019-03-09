import moment from 'moment';
import store from '@/store';
import config from '@/transitional/config';
import createTask from '@/transitional/tasks';
import { taskStates } from '@/store/modules/tasks';
import { taxTypes, taxTypeNumericalCodes, browserFeatures } from '../constants';
import { TaxTypeNotFoundError } from '../errors';
import { getDocumentByAjax } from '../utils';
import { parseTableAdvanced } from '../content_scripts/helpers/zra';
import {
  downloadReceipt,
  parallelTaskMap,
  getPagedData,
  taskFunction,
} from './utils';

/**
 * @typedef {import('../constants').Client} Client
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
async function getAcknowledgementReceiptsReferenceNumbers({
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
async function getAllAcknowledgementReceiptsReferenceNumbers({
  tpin, taxType, fromDate, toDate, exciseType, parentTaskId,
}) {
  const options = {
    tpin,
    taxType,
    fromDate,
    toDate,
    exciseType,
  };

  const task = await createTask(store, {
    title: "Get acknowledgement receipts' reference numbers",
    parent: parentTaskId,
  });

  const getPageSubTask = (page, subTaskParentId) => ({
    title: `Getting reference numbers from page ${page + 1}`,
    parent: subTaskParentId,
    indeterminate: true,
  });

  const results = await getPagedData({
    task,
    getPageSubTask,
    getDataFunction: (page) => {
      const optionsWithPage = Object.assign({ page }, options);
      return getAcknowledgementReceiptsReferenceNumbers(optionsWithPage);
    },
  });

  const referenceNumbers = [];
  for (const result of results) {
    for (const record of result.records) {
      if (record.appliedThrough.toLowerCase() === 'online') {
        referenceNumbers.push(record.referenceNo);
      }
    }
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
function downloadAcknowledgementReceipt({
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
async function downloadAcknowledgementReceipts({
  client, taxType, referenceNumbers, parentTaskId,
}) {
  const task = await createTask(store, { title: 'Download acknowledgement receipts', parent: parentTaskId });
  return parallelTaskMap({
    list: referenceNumbers,
    task,
    func(referenceNumber, parentTaskId) {
      return downloadAcknowledgementReceipt({
        client, taxType, referenceNumber, parentTaskId,
      });
    },
  });
}

/** @type {import('@/backend/constants').ClientActionObject} */
const clientAction = {
  id: 'getAcknowledgementsOfReturns',
  name: 'Get acknowledgements of returns',
  requiredFeatures: [browserFeatures.MHTML],
  requiresTaxTypes: true,
  async func({ client, parentTask, clientActionConfig }) {
    const initialMaxOpenTabs = config.maxOpenTabs;
    config.maxOpenTabs = clientActionConfig.maxOpenTabsWhenDownloading;

    await parallelTaskMap({
      list: client.taxTypes,
      task: parentTask,
      autoCalculateTaskState: false,
      async func(taxTypeId, parentTaskId) {
        const taxType = taxTypes[taxTypeId];

        const task = await createTask(store, {
          title: `Get ${taxType} acknowledgement receipts`,
          parent: parentTaskId,
          unknownMaxProgress: false,
          progressMax: 2,
        });

        return taskFunction({
          task,
          catchErrors: true,
          setStateBasedOnChildren: true,
          async func() {
            const referenceNumbers = await getAllAcknowledgementReceiptsReferenceNumbers({
              tpin: client.username,
              taxType: taxTypeId,
              fromDate: '01/01/2013',
              toDate: moment().format('31/12/YYYY'),
              exciseType: exciseTypes.airtime,
              parentTaskId: task.id,
            });
            await downloadAcknowledgementReceipts({
              taxType: taxTypeId,
              referenceNumbers,
              parentTaskId: task.id,
              client,
            });
          },
        });
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
    } else if (parentTask.children.length > 0 && taxTypeErrorCount === parentTask.children.length) {
      // If all sub tasks don't have a tax type, something probably went wrong
      parentTask.state = taskStates.WARNING;
      parentTask.errorString = 'No tax types found.';
    } else if (parentTask.childStateCounts[taskStates.WARNING] > 0) {
      parentTask.state = taskStates.WARNING;
    } else {
      parentTask.state = taskStates.SUCCESS;
    }
  },
};
export default clientAction;
