import moment from 'moment';
import { getDocumentByAjax } from '../utils';
import { parseTableAdvanced } from '../content_scripts/helpers/zra';
import {
  taskFunction,
  downloadPages,
  downloadPage,
  getQuarterFromPeriod,
} from './utils';
import {
  startDownloadingReceipts,
  finishDownloadingReceipts,
  getFailedResponseItems,
  getReceiptData,
  getDataFromReceiptTab,
} from './receipts';
import {
  taxTypeNames,
  taxTypeNumericalCodes,
  taxTypes,
} from '../constants';
import {
  createClientAction, ClientActionRunner, getInput,
} from './base';
import { InvalidReceiptError } from '../errors';
import getDataFromReceipt from '../content_scripts/helpers/receipt_data';

/**
 * @typedef {import('../constants').Date} Date
 * @typedef {import('../constants').Client} Client
 */

/**
 * @template R
 * @typedef {import('./utils').GetDataFromPageFunctionReturn<R>} GetDataFromPageFunctionReturn
 */

/**
 * @typedef GetPaymentReceiptsOptions
 * @property {Date} fromDate
 * @property {Date} toDate
 * @property {string} [receiptNumber]
 * @property {import('../constants').ReferenceNumber} [referenceNumber]
 */

/**
 * @typedef {Object} PrnNo
 * @property {string} innerText E.g. '118019903987'
 * @property {string} onclick
 * Contains information about the payment such as search code, reference number and payment type
 * in the following format:
 * `payementHistory('<search code>','<reference number>','<payment type>')`
 * E.g.
 * `payementHistory('123456789','123456789','ABC')`
 */

/**
 * @typedef PaymentReceipt
 * @property {string} srNo Serial number
 * @property {PrnNo} prnNo PRN number
 * @property {string} amount Amount in Kwacha
 * @property {string} status E.g. 'Payment received'
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
 * Gets payment receipts from a single page.
 * @param {number} page
 * @param {GetPaymentReceiptsOptions} options
 * @returns {Promise.<GetDataFromPageFunctionReturn<PaymentReceipt[]>>}
 */
async function getPaymentReceipts(page, {
  fromDate,
  toDate,
  referenceNumber = '',
  receiptNumber = '',
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
  const table = await parseTableAdvanced({
    root: doc,
    headers: recordHeaders,
    tableInfoSelector: '#contentDiv>table>tbody>tr>td',
    recordSelector: '#contentDiv>table:nth-child(2)>tbody>tr',
    noRecordsString: 'No Records Found',
    parseLinks: true,
  });
  let { records } = table;
  if (records.length > 0) {
    // Remove header row
    records.shift();
    // Ignore all the payment registrations
    records = records.filter(record => record.status.toLowerCase() !== 'prn generated');
  }
  return {
    numPages: table.numPages,
    value: records,
  };
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
 * @typedef {Object} PaymentReceiptPayment
 * @property {string} taxType
 * @property {string} accountName
 * @property {string} liabilityType
 * @property {string} periodFrom
 * @property {string} periodTo
 * @property {string} chargeYear
 * @property {string} chargeQuater
 * @property {string} alternativeNumber
 * @property {string} amount
 */

/**
 * @typedef PaymentReceiptData
 * @property {string} registrationDate
 * @property {string} referenceNumber
 * @property {string} prn
 * @property {string} paymentDate
 * @property {string} searchCode
 * @property {string} paymentType
 * @property {PaymentReceiptPayment[]} payments
 */

/**
 * @param {Client} client
 * @param {PaymentReceiptData} receiptData
 * @returns {string[]}
 */
function getPaymentReceiptFilenames(client, receiptData) {
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
}

/**
 * @param {Object} options
 * @param {Client} options.client
 * @param {PaymentReceipt} options.receipt
 * @param {number} options.parentTaskId
 */
function downloadPaymentReceipt({ client, receipt, parentTaskId }) {
  const [searchCode, refNo, pmtRegType] = receipt.prnNo.onclick.replace(/'/g, '').match(/\((.+)\)/)[1].split(',');

  return downloadPage({
    async filename(dataSource) {
      let receiptData;
      if (dataSource instanceof HTMLDocument) {
        receiptData = await getDataFromReceipt(dataSource, 'payment');
      } else {
        receiptData = await getDataFromReceiptTab(dataSource, 'payment');
      }
      if (!receiptData.referenceNumber) {
        throw new InvalidReceiptError('Invalid receipt; missing reference number.');
      }
      return getPaymentReceiptFilenames(client, receiptData);
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

const GetPaymentReceiptsClientAction = createClientAction({
  id: 'getPaymentReceipts',
  name: 'Get payment receipts',
  requiredFeatures: [],
  defaultInput: () => ({
    fromDate: '01/10/2013',
    toDate: moment().format('DD/MM/YYYY'),
  }),
  inputValidation: {
    fromDate: 'required|date_format:dd/MM/yyyy|before:toDate,true',
    toDate: 'required|date_format:dd/MM/yyyy|after:fromDate,true',
  },
});

/**
 * @typedef {Object} RunnerInput
 * @property {import('@/backend/constants').Date} [fromDate]
 * @property {import('@/backend/constants').Date} [toDate]
 * @property {PaymentReceipt[]} receipts
 * @property {number[]} receiptDataPages
 */

GetPaymentReceiptsClientAction.Runner = class extends ClientActionRunner {
  constructor() {
    super(GetPaymentReceiptsClientAction);
  }

  async runInternal() {
    const { task: actionTask, client } = this.storeProxy;
    // eslint-disable-next-line prefer-destructuring
    const input = /** @type {RunnerInput} */(this.storeProxy.input);
    actionTask.unknownMaxProgress = false;
    actionTask.progressMax = 2;

    const failed = {
      receipts: [],
      receiptDataPages: [],
    };

    await taskFunction({
      task: actionTask,
      setStateBasedOnChildren: true,
      func: async () => {
        // If specific receipts have been requested to be downloaded, use those.
        const { value: receipts } = getInput(input, 'receipts', { defaultValue: [] });

        // If getting certain receipt data pages failed last time, only get those pages.
        const { value: pages } = getInput(input, 'receiptDataPages', { defaultValue: [] });

        if (pages.length > 0 || receipts.length === 0) {
          actionTask.status = 'Getting payment receipt numbers';
          const { data, failedPages } = await getReceiptData({
            taskTitle: 'Get payment receipt numbers',
            getPageTaskTitle: page => `Get payment receipt numbers from page ${page}`,
            getDataFunction: page => getPaymentReceipts(page, {
              fromDate: input.fromDate,
              toDate: input.toDate,
            }),
            parentTaskId: actionTask.id,
            pages,
          });
          receipts.push(...data);
          failed.receiptDataPages = failedPages;
        }

        // TODO: Indicate why receipts weren't downloaded
        if (receipts.length > 0) {
          actionTask.status = `Downloading ${receipts.length} payment receipt(s)`;
          await startDownloadingReceipts();
          const downloadResponses = await downloadPages({
            taskTitle: `Download ${receipts.length} payment receipt(s)`,
            parentTaskId: actionTask.id,
            list: receipts,
            downloadPageFn(receipt, parentTaskId) {
              return downloadPaymentReceipt({ receipt, parentTaskId, client });
            },
          });
          await finishDownloadingReceipts();
          failed.receipts = getFailedResponseItems(downloadResponses);
        }
      },
    });

    if (failed.receipts.length > 0 || failed.receiptDataPages.length > 0) {
      this.setRetryReason('Some receipts failed to download.');
      if (failed.receipts.length > 0) {
        this.storeProxy.retryInput.receipts = failed.receipts;
      }
      if (failed.receiptDataPages.length > 0) {
        this.storeProxy.retryInput.receiptDataPages = failed.receiptDataPages;
      }
    }
  }
};

export default GetPaymentReceiptsClientAction;
