import moment from 'moment';
import store from '@/store';
import config from '@/transitional/config';
import createTask from '@/transitional/tasks';
import { taxTypes, taxTypeNumericalCodes, browserFeatures } from '../constants';
import { getDocumentByAjax } from '../utils';
import { parseTableAdvanced } from '../content_scripts/helpers/zra';
import {
  downloadReceipt,
  parallelTaskMap,
  getPagedData,
  taskFunction,
  startDownloadingReceipts,
  finishDownloadingReceipts,
} from './utils';
import { createClientAction, ClientActionRunner } from './base';

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

  return parseTableAdvanced({
    root: doc,
    headers: recordHeaders,
    tableInfoSelector: '#ReturnHistoryForm>table:nth-child(8)>tbody>tr>td',
    recordSelector: '#ReturnHistoryForm>table.FORM_TAB_BORDER.marginStyle>tbody>tr.whitepapartd.borderlessInput',
    noRecordsString: 'No Data Found',
  });
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
  for (const result of Object.values(results)) {
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
 * @returns {Promise<boolean[]>}
 * Array of booleans indicating whether each receipt downloaded successfully.
 */
async function downloadAcknowledgementReceipts({
  client, taxType, referenceNumbers, parentTaskId,
}) {
  const task = await createTask(store, { title: 'Download acknowledgement receipts', parent: parentTaskId });
  return parallelTaskMap({
    list: referenceNumbers,
    task,
    async func(referenceNumber, parentTaskId) {
      try {
        await downloadAcknowledgementReceipt({
          client, taxType, referenceNumber, parentTaskId,
        });
        return true;
      } catch (error) {
        return false;
      }
    },
  });
}

const GetAcknowledgementsOfReturnsClientAction = createClientAction({
  id: 'getAcknowledgementsOfReturns',
  name: 'Get acknowledgements of returns',
  requiredFeatures: [browserFeatures.MHTML],
  requiresTaxTypes: true,
});

GetAcknowledgementsOfReturnsClientAction.Runner = class extends ClientActionRunner {
  constructor(data) {
    super(data);
    this.storeProxy.actionId = GetAcknowledgementsOfReturnsClientAction.id;
  }

  async runInternal() {
    const { client, parentTask, config: actionConfig } = this.storeProxy;
    const initialMaxOpenTabs = config.maxOpenTabs;
    config.maxOpenTabs = actionConfig.maxOpenTabsWhenDownloading;

    let anyReceiptsFailedToDownload = false;

    await startDownloadingReceipts();
    await parallelTaskMap({
      list: client.taxTypes,
      task: parentTask,
      func: async (taxTypeId, parentTaskId) => {
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
          func: async () => {
            const referenceNumbers = await getAllAcknowledgementReceiptsReferenceNumbers({
              tpin: client.username,
              taxType: taxTypeId,
              fromDate: '01/01/2013',
              toDate: moment().format('31/12/YYYY'),
              exciseType: exciseTypes.airtime,
              parentTaskId: task.id,
            });
            // TODO: Indicate why receipts weren't downloaded
            if (referenceNumbers.length > 0) {
              const downloadSuccesses = await downloadAcknowledgementReceipts({
                taxType: taxTypeId,
                referenceNumbers,
                parentTaskId: task.id,
                client,
              });
              if (downloadSuccesses.includes(false)) {
                anyReceiptsFailedToDownload = true;
              }
            }
          },
        });
      },
    });
    await finishDownloadingReceipts();

    config.maxOpenTabs = initialMaxOpenTabs;
    if (anyReceiptsFailedToDownload) {
      this.setRetryReason('Some receipts failed to download.');
    }
  }
};

export default GetAcknowledgementsOfReturnsClientAction;
