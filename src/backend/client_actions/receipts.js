import store from '@/store';
import createTask from '@/transitional/tasks';
import { InvalidReceiptError } from '../errors';
import { runContentScript } from '../utils';
import {
  changeLiteMode,
  getPagedData,
} from './utils';
import { getElementFromDocument } from '../content_scripts/helpers/elements';
import { parseTable } from '../content_scripts/helpers/zra';

/**
 * @typedef {'payment'|'ack_return'} ReceiptType
 */

/**
 * @typedef {Object} ReceiptData
 * @property {string} registrationDate
 * @property {string} referenceNumber
 */

/**
* @typedef {Object} PaymentReceiptData_Temp
* @property {import('@/backend/client_actions/payment_history').PaymentReceiptData[]} payments
* @typedef {ReceiptData & PaymentReceiptData_Temp} PaymentReceiptData
*/

/**
 * @typedef {Object} AckReceiptData_Temp
 * @property {string} liabilityAmount E.g. '4,200.00'
 *
 * @typedef {ReceiptData & AckReceiptData_Temp} AckReceiptData
 */

/**
 * @param {HTMLDocument|HTMLElement} root
 * @param {ReceiptType} type
 * @returns {PaymentReceiptData | AckReceiptData}
 */
// TODO: Improve performance by only getting the data that is required. For instance, registration
// date and reference number doesn't always need to be retrieved.
export function getDataFromReceipt(root, type) {
  let column = '';
  if (type === 'payment') {
    column = '4';
  } else if (type === 'ack_return') {
    column = '3';
  }
  const mainTable = getElementFromDocument(root,
    'form>table>tbody>tr:nth-child(2)>td:nth-child(2)>table:nth-child(1)>tbody',
    'main table');
  const infoTable = getElementFromDocument(
    mainTable,
    `tr:nth-child(5)>td:nth-child(${column})>table>tbody`,
    'info table',
  );
  const registrationDate = getElementFromDocument(
    infoTable,
    'tr:nth-child(2)>td:nth-child(3)',
    'registration date',
  ).innerText;
  const referenceNumber = getElementFromDocument(
    infoTable,
    'tr:nth-child(3)>td:nth-child(3)',
    'reference number',
  ).innerText;

  const data = {
    registrationDate,
    referenceNumber,
  };
  if (type === 'payment') {
    const rows = {
      prn: 4,
      paymentDate: 5,
      searchCode: 6,
      paymentType: 7,
    };
    for (const name of Object.keys(rows)) {
      data[name] = getElementFromDocument(
        infoTable,
        `tr:nth-child(${rows[name]})>td:nth-child(3)`,
        name,
      ).innerText;
    }

    const paymentTable = getElementFromDocument(root, '#pmt_dtl', 'payment table');
    const payments = parseTable({
      root: paymentTable,
      headers: [
        'taxType',
        'accountName',
        'liabilityType',
        'periodFrom',
        'periodTo',
        'chargeYear',
        'chargeQuater',
        'alternativeNumber',
        'amount',
      ],
      recordSelector: 'tbody>tr',
    });
    // exclude 'total payment amount' row
    if (payments.length > 0) {
      payments.pop();
    }
    data.payments = payments;
  } else if (type === 'ack_return') {
    const receiptTable = getElementFromDocument(root, '#ReturnHistoryForm>table>tbody>tr:nth-child(2)>td:nth-child(2)>table>tbody');
    const liabilityAmountInfo = getElementFromDocument(receiptTable, 'tr:nth-child(12)>td:nth-child(2)').innerText;
    const matches = liabilityAmountInfo.match(/Liability Amount\s*:\s*K\s*(.+)/);
    [, data.liabilityAmount] = matches;
  }

  return data;
}

/**
 * Extracts information from a receipt that has been opened in a tab.
 * @param {browser.tabs.Tab} tab
 * @param {ReceiptType} type
 */
export async function getDataFromReceiptTab(tab, type) {
  const receiptData = await runContentScript(tab.id, 'get_receipt_data', { type });
  if (!receiptData.referenceNumber) {
    throw new InvalidReceiptError('Invalid receipt; missing reference number.');
  }
  if (receiptData === null) {
    throw new InvalidReceiptError('Invalid receipt; failed to collect receipt data.');
  }
  return receiptData;
}

export function startDownloadingReceipts() {
  return changeLiteMode(false);
}

export function finishDownloadingReceipts() {
  return changeLiteMode(true);
}

/**
 * @template R
 * @typedef {Object} GetReceiptDataResponse
 * @property {R} data The receipt data fetched from all pages in a single flat array.
 * @property {number[]} failedPages Pages from which receipt data could not be fetched.
 */

/**
 * Gets data from multiple pages that is required to download receipts.
 * @template Response
 * @param {Object} options
 * @param {number} options.parentTaskId
 * @param {string} options.taskTitle
 * Title of the main task.
 * @param {(page: number) => string} options.getPageTaskTitle
 * Function that generates the title of a page task using a page number.
 * @param {import('./utils').GetDataFromPageFunction<Response[]>} options.getDataFunction
 * @param {number[]} [options.pages] Specific pages to fetch.
 * @returns {Promise.<GetReceiptDataResponse<Response[]>>}
 */
// TODO: Rename this to apply to downloading returns as well as return receipts.
export async function getReceiptData({
  parentTaskId,
  taskTitle,
  getPageTaskTitle,
  getDataFunction,
  pages = [],
}) {
  const task = await createTask(store, {
    title: taskTitle,
    parent: parentTaskId,
  });

  const getPageSubTask = (page, subTaskParentId) => ({
    title: getPageTaskTitle(page),
    parent: subTaskParentId,
    indeterminate: true,
  });

  const responses = await getPagedData({
    task,
    getPageSubTask,
    getDataFunction,
    pages,
  });

  const data = [];
  const failedPages = [];
  for (const response of responses) {
    if (!('error' in response)) {
      if (Array.isArray(response.value)) {
        data.push(...response.value);
      } else {
        throw new Error('Receipt data fetched from a page must be an array. For example, an array of reference numbers.');
      }
    } else {
      failedPages.push(response.page);
    }
  }
  return { data, failedPages };
}

/**
 * Gets the items of all responses that failed from an array of parallel task map responses.
 */
export function getFailedResponseItems(downloadResponses) {
  const items = [];
  for (const response of downloadResponses) {
    if ('error' in response) {
      items.push(response.item);
    }
  }
  return items;
}