import moment from 'moment';
import store from '@/store';
import createTask from '@/transitional/tasks';
import config from '@/transitional/config';
import { getDocumentByAjax } from '../utils';
import { parseTableAdvanced } from '../content_scripts/helpers/zra';
import {
  downloadReceipt,
  parallelTaskMap,
  getPagedData,
  taskFunction,
} from './utils';
import {
  taxTypeNames,
  taxTypeNumericalCodes,
  taxTypes,
  browserFeatures,
} from '../constants';

/**
 * @typedef {import('../constants').Date} Date
 * @typedef {import('../constants').Client} Client
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

/* eslint-disable max-len */
/**
 * @typedef {GetAllPaymentReceiptNumbersOptions & GetPaymentReceiptNumbersOptions.Temp} GetPaymentReceiptNumbersOptions
 */
/* eslint-enable max-len */

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
 * @typedef {Object} PrnNo
 * @property {string} innerText '118019903987'
 * @property {string} onclick "payementHistory('0617620366056', '1051185712615', 'WCO')"
 */

/**
 * @typedef {Object} PaymentReceiptNumbers
 * ```js
  {
  srNo: '1',
  prnNo: {
    innerText: '118019903987',
    onclick: "payementHistory('0617620366056', '1051185712615', 'WCO')",
  },
  amount: '365.00',
  status: 'Payment Received',
  prnDate: '12 / 05 / 2018',
  paymentDate: '16 / 05 / 2018',
  type: 'Without Cash Office',
  }
 ```
 * @property {string} srNo '1'
 * @property {PrnNo} prnNo
 * @property {string} amount '365.00'
 * @property {string} status 'Payment Received'
 * @property {string} prnDate '12 / 05 / 2018'
 * @property {string} paymentDate '16 / 05 / 2018'
 * @property {string} type 'Without Cash Office'
 */

/**
 * Gets payment receipt numbers from a single page.
 * @param {GetPaymentReceiptNumbersOptions} options
 * TODO: Document return type
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
  return parseTableAdvanced({
    root: doc,
    headers: recordHeaders,
    tableInfoSelector: '#contentDiv>table>tbody>tr>td',
    recordSelector: '#contentDiv>table:nth-child(2)>tbody>tr',
    noRecordsString: 'No Records Found',
  });
}

/**
 * Gets payment receipt numbers from all pages.
 * @param {GetAllPaymentReceiptNumbersOptions} options
 * @param {number} parentTaskId
 * @returns {Promise<PaymentReceiptNumbers[]>}
 */
async function getAllPaymentReceiptNumbers(options, parentTaskId) {
  const task = await createTask(store, {
    title: 'Get payment receipt numbers',
    parent: parentTaskId,
  });

  const getPageSubTask = (page, subTaskParentId) => ({
    title: `Get payment receipt numbers from page ${page + 1}`,
    parent: subTaskParentId,
    indeterminate: true,
  });

  const results = await getPagedData({
    task,
    getPageSubTask,
    getDataFunction: (page) => {
      const optionsWithPage = Object.assign({ page }, options);
      return getPaymentReceiptNumbers(optionsWithPage);
    },
  });

  const records = [];
  for (const result of results) {
    if (result.records.length > 0) {
      // Remove header rows
      result.records.shift();
      for (const record of result.records) {
        // Ignore all the payment registrations
        if (record.status.toLowerCase() !== 'prn generated') {
          records.push(record);
        }
      }
    }
  }
  return records;
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
        filename += `-${receiptData.prn}`;
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
async function downloadPaymentReceipts({ client, receipts, parentTaskId }) {
  const task = await createTask(store, { title: 'Download payment receipts', parent: parentTaskId });
  return parallelTaskMap({
    list: receipts,
    task,
    func(receipt, parentTaskId) {
      return downloadPaymentReceipt({ client, receipt, parentTaskId });
    },
  });
}

/** @type {import('@/backend/constants').ClientActionObject} */
const clientAction = {
  id: 'getPaymentReceipts',
  name: 'Get payment receipts',
  requiredFeatures: [browserFeatures.MHTML],
  func({ client, parentTask, clientActionConfig }) {
    return new Promise((resolve, reject) => {
      const options = {
        fromDate: '01/10/2013',
        toDate: moment().format('DD/MM/YYYY'),
      };

      parentTask.unknownMaxProgress = false;
      parentTask.progressMax = 2;

      taskFunction({
        task: parentTask,
        setStateBasedOnChildren: true,
        async func() {
          const receipts = await getAllPaymentReceiptNumbers(options, parentTask.id);
          const initialMaxOpenTabs = config.maxOpenTabs;
          // TODO: Indicate why receipts weren't downloaded
          if (receipts.length > 0) {
            config.maxOpenTabs = clientActionConfig.maxOpenTabsWhenDownloading;
            await downloadPaymentReceipts({ client, receipts, parentTaskId: parentTask.id });
            config.maxOpenTabs = initialMaxOpenTabs;
          }
        },
      }).then(resolve).catch(reject);
    });
  },
};
export default clientAction;
