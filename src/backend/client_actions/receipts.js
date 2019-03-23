import store from '@/store';
import config from '@/transitional/config';
import createTask from '@/transitional/tasks';
import { InvalidReceiptError } from '../errors';
import {
  closeTab,
  createTabPost,
  monitorDownloadProgress,
  runContentScript,
  saveAsMHTML,
  tabLoaded,
} from '../utils';
import {
  changeLiteMode,
  parallelTaskMap,
  taskFunction,
  getPagedData,
} from './utils';

/**
 * @typedef {Object} DownloadReceiptOptions
 * @property {'return'|'payment'} type
 * @property {string|string[]|Function} filename
 * Filename of the downloaded receipt.
 *
 * If an array of filenames is provided, multiple files will be downloaded.
 *
 * If a function is provided, it must return a string or array. It will be called with
 * an object containing information about the receipt such as reference number.
 * @property {string} taskTitle
 * @property {number} parentTaskId
 * @property {import('../utils').CreateTabPostOptions} createTabPostOptions
 */

/**
 * Downloads a receipt
 * @param {DownloadReceiptOptions} options
 */
export async function downloadReceipt({
  type, filename, taskTitle, parentTaskId, createTabPostOptions,
}) {
  const task = await createTask(store, {
    title: taskTitle,
    parent: parentTaskId,
    progressMax: 4,
    status: 'Opening receipt tab',
  });
  return taskFunction({
    task,
    async func() {
      const tab = await createTabPost(createTabPostOptions);
      try {
        task.addStep('Waiting for receipt to load');
        await tabLoaded(tab.id);

        const receiptData = await runContentScript(tab.id, 'get_receipt_data', { type });

        if (!receiptData.referenceNumber) {
          throw new InvalidReceiptError('Invalid receipt; missing reference number.');
        }

        task.addStep('Converting receipt to MHTML');
        const blob = await saveAsMHTML({ tabId: tab.id });
        const url = URL.createObjectURL(blob);
        task.addStep('Downloading generated MHTML');

        let generatedFilename;
        if (typeof filename === 'function') {
          generatedFilename = filename(receiptData);
        } else {
          generatedFilename = filename;
        }
        let generatedFilenames;
        if (typeof generatedFilename === 'string') {
          generatedFilenames = [generatedFilename];
        } else {
          generatedFilenames = generatedFilename;
        }
        const taskProgressBeforeDownload = task.progress;
        if (Array.isArray(generatedFilenames)) {
          const promises = [];
          for (const generatedFilename of generatedFilenames) {
            promises.push(new Promise(async (resolve) => {
              let downloadFilename = generatedFilename;
              if (!config.export.removeMhtmlExtension) {
                downloadFilename += '.mhtml';
              }
              const downloadId = await browser.downloads.download({
                url,
                filename: downloadFilename,
              });
              // FIXME: Catch and handle download errors
              await monitorDownloadProgress(downloadId, (downloadProgress) => {
                if (downloadProgress !== -1) {
                  task.progress = taskProgressBeforeDownload + downloadProgress;
                }
              });
              resolve();
            }));
          }
          await Promise.all(promises);
        } else {
          throw new Error('Invalid filename attribute; filename must be a string, array or function.');
        }
      } finally {
        // Don't need to wait for the tab to close to carry out logged in actions
        // TODO: Catch tab close errors
        closeTab(tab.id);
      }
    },
  });
}

/**
 * @template L
 * @callback GetDownloadReceiptOptionsFunc
 * Gets the options to use in downloadReceipts from an item.
 * @param {L} item
 * @param {number} parentTaskId
 * @returns {DownloadReceiptOptions}
 */

/**
 * Downloads multiple receipts in parallel.
 * @template L
 * @param {Object} options
 * @param {string} [options.taskTitle]
 * Title of the task that will be a parent to all the receipt downloading tasks.
 * @param {number} options.parentTaskId
 * @param {Array<L>} options.list Array of data to use when downloading receipts.
 * @param {GetDownloadReceiptOptionsFunc<L>} options.getDownloadReceiptOptions
 * Function that returns the options that will be passed to `downloadReceipts`. It's called on each
 * item in the array of data list.
 */
export async function downloadReceipts({
  taskTitle = 'Download receipts',
  parentTaskId,
  list,
  getDownloadReceiptOptions: downloadReceiptFunc,
}) {
  const task = await createTask(store, { title: taskTitle, parent: parentTaskId });
  return parallelTaskMap({
    list,
    task,
    neverReject: true,
    func: async (item, parentTaskId) => {
      const downloadOptions = await downloadReceiptFunc(item, parentTaskId);
      return downloadReceipt(downloadOptions);
    },
  });
}

export function startDownloadingReceipts() {
  return changeLiteMode(false);
}

export async function finishDownloadingReceipts() {
  return changeLiteMode(true);
}

/**
 * Gets data from multiple pages that is required to download receipts.
 * @template Response
 * @param {Object} options
 * @param {number} options.parentTaskId
 * @param {string} options.taskTitle
 * Title of the main task.
 * @param {(page: number) => string} options.getPageTaskTitle
 * Function that generates the title of a page task using a page number.
 * @param {import('./utils').GetDataFromPageFunction<Response>} options.getDataFunction
 */
export async function getPagedReceiptData({
  parentTaskId,
  taskTitle,
  getPageTaskTitle: pageTaskTitle,
  getDataFunction,
}) {
  const task = await createTask(store, {
    title: taskTitle,
    parent: parentTaskId,
  });

  const getPageSubTask = (page, subTaskParentId) => ({
    title: pageTaskTitle(page + 1),
    parent: subTaskParentId,
    indeterminate: true,
  });

  return getPagedData({
    task,
    getPageSubTask,
    getDataFunction,
  });
}
