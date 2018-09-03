import moment from 'moment';
import { Task, taskStates } from '../tasks';
import { ClientAction } from './base';
import { getDocumentByAjax } from '../utils';
import { parseTableAdvanced } from '../content_scripts/helpers/zra';
import { downloadReceipt, parallelTaskMap } from './utils';

/**
 * @typedef {import('../constants').Client} Client
 * @typedef {import('./base').Output} Output
 */

/**
 * @typedef GetAllPaymentReceiptNumbersOptions
 * @property {number} fromDate
 * @property {number} toDate
 * @property {string} [receiptNumber]
 * @property {string} [referenceNumber]
 */

/**
 * @typedef GetPaymentReceiptNumbersOptions
 * @property {number} page
 * @property {number} fromDate
 * @property {number} toDate
 * @property {string} [receiptNumber]
 * @property {string} [referenceNumber]
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
 * @property {string} prnDate
 * @property {string} paymentDate
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
  return parseTableAdvanced({
    root: doc,
    headers: recordHeaders,
    tableInfoSelector: '#contentDiv>table>tbody>tr>td',
    recordSelector: '#contentDiv>table:nth-child(2)>tbody>tr',
    noRecordsString: 'No Records Found',
  });
}

async function getPaymentReceiptNumbersTask(options, page, parentTask) {
  const childTask = new Task(`Get payment receipt numbers from page ${page + 1}`, parentTask.id);
  // TODO: set child tasks to be indeterminate. Haven't yet because of the way
  // parent task progress is calculated
  childTask.progress = 0;
  childTask.progressMax = 1;
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
 * @param {Task} parentTask
 */
function getAllPaymentReceiptNumbers(options, parentTask) {
  const task = new Task('Get payment receipt numbers', parentTask.id);
  task.sequential = false;
  task.unknownMaxProgress = false;
  // this is overwritten once we know the number of pages
  task.progressMax = 1;

  return new Promise(async (resolve, reject) => {
    try {
      const promises = [];
      const result = await getPaymentReceiptNumbersTask(options, 0, task);
      if (result.numPages > 1) {
        task.progressMax = result.numPages;
      }
      for (let page = 1; page < result.numPages; page++) {
        promises.push(new Promise((resolve) => {
          getPaymentReceiptNumbersTask(options, page, task)
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
        task.state = task.getStateFromChildren();
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
 * @param {Object} options
 * @param {Client} options.client
 * @param {PaymentReceipt} options.receipt
 * @param {Task} options.parentTask
 */
function downloadPaymentReceipt({ client, receipt, parentTask }) {
  const [searchCode, refNo, pmtRegType] = receipt.prnNo.onclick.replace(/'/g, '').match(/\((.+)\)/)[1].split(',');

  return downloadReceipt({
    type: 'payment',
    filename(receiptData) {
      const date = moment(receiptData.paymentDate, 'DD/MM/YYYY').format('DD-MM-YYYY');
      return `receipt-${client.username}-${date}-${refNo}.mhtml`;
    },
    taskTitle: `Download receipt ${refNo}`,
    parentTask,
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
 * @param {Task} options.parentTask
 */
function downloadPaymentReceipts({ client, receipts, parentTask }) {
  return parallelTaskMap({
    list: receipts,
    task: new Task('Download payment receipts', parentTask.id),
    func(receipt, parentTask) {
      return downloadPaymentReceipt({ client, receipt, parentTask });
    },
  });
}

export default new ClientAction('Get payment history', 'get_all_payments',
  /**
   * @param {Client} client
   * @param {Task} parentTask
   */
  ((client, parentTask) => new Promise(async (resolve, reject) => {
    const options = {
      fromDate: '01/10/2013',
      toDate: moment().format('DD/MM/YYYY'),
    };

    parentTask.unknownMaxProgress = false;
    parentTask.progressMax = 2;

    try {
      const receipts = await getAllPaymentReceiptNumbers(options, parentTask);
      await downloadPaymentReceipts({ client, receipts, parentTask });
      resolve();
    } catch (error) {
      parentTask.setError(error);
      reject(error);
    } finally {
      parentTask.complete = true;
      parentTask.state = parentTask.getStateFromChildren();
    }
  })));
