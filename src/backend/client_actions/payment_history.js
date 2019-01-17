import moment from 'moment';
import store from '@/store';
import createTask from '@/transitional/tasks';
import { taskStates } from '@/store/modules/tasks';
import { ClientAction } from './base';
import { getDocumentByAjax } from '../utils';
import { parseTableAdvanced } from '../content_scripts/helpers/zra';
import { downloadReceipt, parallelTaskMap } from './utils';
import { taxTypeNames, taxTypeNumericalCodes, taxTypes } from '../constants';

const { config } = store.state;

/**
 * @typedef {import('@/transitional/tasks').TaskObject} Task
 * @typedef {import('../constants').Date} Date
 * @typedef {import('../constants').Client} Client
 * @typedef {import('./base').Output} Output
 */

/**
 * @typedef GetAllPaymentReceiptNumbersOptions
 * @property {Date} fromDate
 * @property {Date} toDate
 * @property {string} [receiptNumber]
 * @property {import('../constants').ReferenceNumber} [referenceNumber]
 */

/**
 * @typedef GetPaymentReceiptNumbersOptions.Temp
 * @property {number} page
 */

/**
 * @typedef {GetAllPaymentReceiptNumbersOptions & GetPaymentReceiptNumbersOptions.Temp} GetPaymentReceiptNumbersOptions
 */

/**
 * @typedef PaymentReceipt
 * @property {string} srNo Serial nubmer
 * @property {Object} prnNo PRN number
 * @property {string} prnNo.innerText
 * @property {string} prnNo.onclick
 * Contains information about the payment such as search code, reference number and payment type
 * in the following format:
 * payementHistory('<search code>','<reference number>','<payment type>')
 * E.g.
 * payementHistory('123456789','123456789','ABC')
 * @property {string} amount Amount in Kwacha
 * @property {string} status
 * @property {Date} prnDate
 * @property {Date} paymentDate
 * @property {string} type Payment type. E.g. 'Electronic'
 */

const recordHeaders = [
  'srNo',
  'prnNo',
  'amount',
  'status',
  'prnDate',
  'paymentDate',
  'type',
];

/**
 * Gets payment receipt numbers from a single page.
 * @param {GetPaymentReceiptNumbersOptions} options
 */
async function getPaymentReceiptNumbers({
  receiptNumber = '', referenceNumber = '', page, fromDate, toDate,
}) {
  const doc = await getDocumentByAjax({
    url: 'https://www.zra.org.zm/ePaymentController.htm?actionCode=SearchPmtDetails',
    method: 'post',
    data: {
      currentPage: page,
      periodFrom: fromDate,
      periodTo: toDate,
      ackNo: referenceNumber,
      prnNo: receiptNumber,
    },
  });
  try {
    const parsed = await parseTableAdvanced({
      root: doc,
      headers: recordHeaders,
      tableInfoSelector: '#contentDiv>table>tbody>tr>td',
      recordSelector: '#contentDiv>table:nth-child(2)>tbody>tr',
      noRecordsString: 'No Records Found',
    });
    return parsed;
  } catch (error) {
    if (error.type === 'TableError' && error.code === 'NoRecordsFound') {
      error.message = 'No payment receipts found.';
      throw error;
    } else {
      throw error;
    }
  }
}

/**
 * Creates a task to get payment receipt numbers from a single page.
 * @param {GetAllPaymentReceiptNumbersOptions} options
 * @param {number} page
 * @param {number} parentTaskId
 */
async function getPaymentReceiptNumbersTask(options, page, parentTaskId) {
  const childTask = await createTask(store, {
    title: `Get payment receipt numbers from page ${page + 1}`,
    parent: parentTaskId,
    // TODO: set child tasks to be indeterminate. Haven't yet because of the way
    // parent task progress is calculated
    progress: 0,
    progressMax: 1,
  });
  try {
    const result = await getPaymentReceiptNumbers(Object.assign(options, { page: page + 1 }));
    // Remove header row
    result.records.shift();
    childTask.state = taskStates.SUCCESS;
    return result;
  } catch (error) {
    childTask.setError(error);
    throw error;
  } finally {
    childTask.complete = true;
  }
}

/**
 * Gets payment receipt numbers from all pages.
 * @param {GetAllPaymentReceiptNumbersOptions} options
 * @param {number} parentTaskId
 */
// TODO: Test this
function getAllPaymentReceiptNumbers(options, parentTaskId) {
  return new Promise(async (resolve, reject) => {
    const task = await createTask(store, {
      title: 'Get payment receipt numbers',
      parent: parentTaskId,
      sequential: false,
      unknownMaxProgress: false,
      // this is overwritten once we know the number of pages
      progressMax: 1,
    });
    try {
      const promises = [];
      const result = await getPaymentReceiptNumbersTask(options, 0, task.id);
      if (result.numPages > 1) {
        task.progressMax = result.numPages;
      }
      for (let page = 1; page < result.numPages; page++) {
        promises.push(new Promise((resolve) => {
          getPaymentReceiptNumbersTask(options, page, task.id)
            .then(resolve)
            .catch(resolve);
        }));
      }
      Promise.all(promises).then((results) => {
        let records = [];
        for (const result of results) {
          records = records.concat(result.records);
        }
        // Ignore all the payment registrations
        records = records.filter(record => record.status.toLowerCase() !== 'prn generated');
        task.complete = true;
        task.setStateBasedOnChildren();
        resolve(records);
      });
    } catch (error) {
      task.complete = true;
      task.setError(error);
      reject(error);
    }
  });
}

/**
 * @typedef {Object} Payment
 * @property {import('@/backend/constants').TaxTypeName} taxType Tax type name
 * @property {string} periodFrom
 * @property {string} periodTo
 */

/**
 * Checks if two payments are different.
 * @param {Payment} payment1
 * @param {Payment} payment2
 */
function paymentsDifferent(payment1, payment2) {
  const mustBeEqual = [
    'taxType',
    'periodFrom',
    'periodTo',
  ];
  let anyDifferent = false;
  for (const prop of mustBeEqual) {
    if (payment1[prop] !== payment2[prop]) {
      anyDifferent = true;
      break;
    }
  }
  return anyDifferent;
}

/**
 * Gets the quarter number from a period.
 * @param {string} from The month the period started. E.g. '01'
 * @param {string} to The month the period ended.E.g. '03'
 */
function getQuarterFromPeriod(from, to) {
  const quarterMap = [
    ['01', '03'],
    ['04', '06'],
    ['07', '09'],
    ['10', '12'],
  ];
  let quarter = null;
  for (let i = 0; i < quarterMap.length; i++) {
    if (from === quarterMap[i][0] && to === quarterMap[i][1]) {
      quarter = i + 1;
      break;
    }
  }
  return quarter;
}

/**
 * @param {Object} options
 * @param {Client} options.client
 * @param {PaymentReceipt} options.receipt
 * @param {number} options.parentTaskId
 */
function downloadPaymentReceipt({ client, receipt, parentTaskId }) {
  const [searchCode, refNo, pmtRegType] = receipt.prnNo.onclick.replace(/'/g, '').match(/\((.+)\)/)[1].split(',');

  return downloadReceipt({
    type: 'payment',
    filename(receiptData) {
      const uniquePayments = [];
      for (const payment of receiptData.payments) {
        let unique = true;
        for (const paymentCompare of uniquePayments) {
          if (!paymentsDifferent(payment, paymentCompare)) {
            unique = false;
            break;
          }
        }
        if (unique) {
          uniquePayments.push(payment);
        }
      }

      return uniquePayments.map((payment) => {
        const taxTypeId = taxTypeNames[payment.taxType.toLowerCase()];
        const periodFrom = moment(payment.periodFrom, 'DD/MM/YYYY');
        const periodTo = moment(payment.periodTo, 'DD/MM/YYYY');
        let filename = `receipt-${client.username}-${taxTypes[taxTypeId]}`;
        if (taxTypeId === taxTypeNumericalCodes.ITX) {
          const chargeYear = periodTo.format('YYYY');
          filename += `-${chargeYear}`;

          const periodFromMonth = periodFrom.format('MM');
          const periodToMonth = periodTo.format('MM');
          // Don't add quarter if the period is a whole year
          if (Number(periodToMonth) - Number(periodFromMonth) < 11) {
            const chargeQuater = getQuarterFromPeriod(periodFromMonth, periodToMonth);
            if (chargeQuater !== null) {
              filename += `-${chargeQuater}`;
            }
          }
        } else {
          filename += `-${periodTo.format('YYYY')}-${periodTo.format('MM')}`;
        }
        filename += `-${receiptData.prn}.mhtml`;
        return filename;
      });
    },
    taskTitle: `Download receipt ${refNo}`,
    parentTaskId,
    createTabPostOptions: {
      url: 'https://www.zra.org.zm/ePaymentController.htm',
      data: {
        actionCode: 'generateView',
        searchcode: searchCode,
        referencecode: refNo,
        pmtRegType,
        printReceipt: 'N',
      },
    },
  });
}

/**
 * @param {Object} options
 * @param {Client} options.client
 * @param {PaymentReceipt[]} options.receipts
 * @param {number} options.parentTaskId
 */
// TODO: Test this
async function downloadPaymentReceipts({ client, receipts, parentTaskId }) {
  return parallelTaskMap({
    list: receipts,
    task: await createTask(store, { title: 'Download payment receipts', parent: parentTaskId }),
    func(receipt, parentTaskId) {
      return downloadPaymentReceipt({ client, receipt, parentTaskId });
    },
  });
}

export default new ClientAction(
  'Get payment history', 'get_all_payments',
  /**
   * @param {Client} client
   * @param {Task} parentTask
   */
  (client, parentTask) => new Promise(async (resolve, reject) => {
    const options = {
      fromDate: '01/10/2013',
      toDate: moment().format('DD/MM/YYYY'),
    };

    parentTask.unknownMaxProgress = false;
    parentTask.progressMax = 2;

    try {
      const receipts = await getAllPaymentReceiptNumbers(options, parentTask.id);
      const initialMaxOpenTabs = config.maxOpenTabs;
      config.maxOpenTabs = config.paymentHistory.maxOpenTabsWhenDownloading;
      await downloadPaymentReceipts({ client, receipts, parentTaskId: parentTask.id });
      config.maxOpenTabs = initialMaxOpenTabs;
      resolve();
    } catch (error) {
      parentTask.setError(error);
      reject(error);
    } finally {
      parentTask.complete = true;
      parentTask.setStateBasedOnChildren();
    }
  }),
);
