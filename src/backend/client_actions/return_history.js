import moment from 'moment';
import store from '@/store';
import config from '@/transitional/config';
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
  getPagedReceiptData,
} from './receipts';
import { createClientAction, ClientActionRunner } from './base';

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
 * Gets return history reference numbers from all the pages that match the given criteria.
 * @param {GetReferenceNumbersOptions} options
 * @param {number} parentTaskId
 */
async function getAllAcknowledgementReceiptsReferenceNumbers(options, parentTaskId) {
  return getPagedReceiptData({
    parentTaskId,
    taskTitle: "Get acknowledgement receipts' reference numbers",
    getPageTaskTitle: page => `Getting reference numbers from page ${page}`,
    getDataFunction: page => getAcknowledgementReceiptsReferenceNumbers(page, options),
  });
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
 */

GetAcknowledgementsOfReturnsClientAction.Runner = class extends ClientActionRunner {
  constructor(data) {
    super(data);
    this.storeProxy.actionId = GetAcknowledgementsOfReturnsClientAction.id;
    this.storeProxy.input = {
      fromDate: '01/01/2013',
      toDate: moment().format('31/12/YYYY'),
    };
  }

  async runInternal() {
    const { client, task: actionTask, config: actionConfig } = this.storeProxy;
    // eslint-disable-next-line prefer-destructuring
    const input = /** @type {RunnerInput} */(this.storeProxy.input);
    const initialMaxOpenTabs = config.maxOpenTabs;
    config.maxOpenTabs = actionConfig.maxOpenTabsWhenDownloading;

    let anyReceiptsFailedToDownload = false;

    await startDownloadingReceipts();
    await parallelTaskMap({
      list: client.taxTypes,
      task: actionTask,
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
            const responses = await getAllAcknowledgementReceiptsReferenceNumbers({
              tpin: client.username,
              taxType: taxTypeId,
              fromDate: input.fromDate,
              toDate: input.toDate,
              exciseType: exciseTypes.airtime,
            }, task.id);
            const referenceNumbers = [];
            for (const response of responses) {
              if (!('error' in response)) {
                referenceNumbers.push(...response.value);
              }
            }
            // TODO: Indicate why receipts weren't downloaded
            if (referenceNumbers.length > 0) {
              const allDownloadInfo = await downloadReceipts({
                taskTitle: 'Download acknowledgement receipts',
                list: referenceNumbers,
                parentTaskId: task.id,
                getDownloadReceiptOptions(referenceNumber, parentTaskId) {
                  return getDownloadReceiptOptions({
                    referenceNumber, parentTaskId, client, taxType: taxTypeId,
                  });
                },
              });
              const failedReceipt = allDownloadInfo.find(downloadInfo => 'error' in downloadInfo);
              if (typeof failedReceipt !== 'undefined') {
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
