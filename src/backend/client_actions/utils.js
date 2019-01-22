import store from '@/store';
import { taskStates } from '@/store/modules/tasks';
import createTask from '@/transitional/tasks';
import { InvalidReceiptError } from '../errors';
import {
  createTabPost,
  executeScript,
  saveAsMHTML,
  sendMessage,
  tabLoaded,
  monitorDownloadProgress,
  closeTab,
} from '../utils';

/** @typedef {import('@/transitional/tasks').TaskObject} Task */

/**
 * Downloads a receipt
 * @param {Object} options
 * @param {'return'|'payment'} options.type
 * @param {string|string[]|Function} options.filename
 * Filename of the downloaded receipt.
 *
 * If an array of filenames is provided, multiple files will be downloaded.
 *
 * If a function is provided, it must return a string or array. It will be called with
 * an object containing information about the receipt such as reference number.
 * @param {string} options.taskTitle
 * @param {number} options.parentTaskId
 * @param {import('../utils').CreateTabPostOptions} options.createTabPostOptions
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
  try {
    const tab = await createTabPost(createTabPostOptions);
    try {
      task.addStep('Waiting for receipt to load');
      await tabLoaded(tab.id);

      await executeScript(tab.id, { file: 'get_receipt_data.js' });
      const receiptData = await sendMessage(tab.id, {
        command: 'getReceiptData',
        type,
      });

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
            const downloadId = await browser.downloads.download({
              url,
              filename: generatedFilename,
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
      task.state = taskStates.SUCCESS;
      task.status = '';
    } finally {
      // Don't need to wait for the tab to close to carry out logged in actions
      // TODO: Catch tab close errors
      closeTab(tab.id);
    }
  } catch (error) {
    task.setError(error);
    throw error;
  } finally {
    task.markAsComplete();
  }
}

/**
 * Loops through a list and runs a provided function asynchronously on each item in the list.
 * The provided parent task will be automatically configured.
 * @param {Object} options
 * @param {Array} options.list The list to loop through
 * @param {Task} options.task The parent task
 * @param {Function} options.func The function to run on each list item
 * @param {boolean} [options.autoCalculateTaskState=true]
 * Set this to false to disable the parent task's state from being automatically
 * set when all the async functions have completed.
 *
 * If this is true, the state will be set based on the task's children by `task.setStateBasedOnChildren()`
 * and the promise will be rejected if the state evaluates to error.
 */
export function parallelTaskMap({
  list,
  task,
  func,
  autoCalculateTaskState = true,
}) {
  return new Promise((resolve, reject) => {
    task.sequential = false;
    task.unknownMaxProgress = false;
    task.progressMax = list.length;
    const promises = [];
    for (const item of list) {
      promises.push(new Promise((resolve) => {
        func(item, task.id)
          .then(resolve)
          .catch(resolve);
      }));
    }
    Promise.all(promises).then((values) => {
      task.markAsComplete();
      if (autoCalculateTaskState) {
        task.setStateBasedOnChildren();
        if (task.state === taskStates.ERROR) {
          reject();
        } else {
          resolve(values);
        }
      } else {
        resolve(values);
      }
    });
  });
}
