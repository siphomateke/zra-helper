import store from '@/store';
import createTask from '@/transitional/tasks';
import { InvalidReceiptError } from '../errors';
import { runContentScript } from '../utils';
import {
  changeLiteMode,
  getPagedData,
} from './utils';

/**
 * Extracts information from a receipt that has been opened in a tab.
 * @param {browser.tabs.Tab} tab
 * @param {import('../content_scripts/helpers/receipt_data').ReceiptType} type
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
