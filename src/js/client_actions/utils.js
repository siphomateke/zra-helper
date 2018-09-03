import { Task, taskStates } from '../tasks';
import {
  createTabPost, saveAsMHTML, tabLoaded, waitForDownloadToComplete, executeScript, sendMessage,
} from '../utils';

export async function downloadReceipt({
  type, filename, taskTitle, parentTask, createTabPostOptions,
}) {
  const task = new Task(taskTitle, parentTask.id);
  task.progressMax = 4;
  task.status = 'Opening receipt tab';
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
      if (Array.isArray(generatedFilenames)) {
        const promises = [];
        for (const generatedFilename of generatedFilenames) {
          promises.push(new Promise(async (resolve) => {
            const downloadId = await browser.downloads.download({
              url,
              filename: generatedFilename,
            });
            // TODO: Show download progress
            await waitForDownloadToComplete(downloadId);
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
      browser.tabs.remove(tab.id);
    }
  } catch (error) {
    task.setError(error);
    throw error;
  } finally {
    task.complete = true;
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
 * If this is true, the state will be set to `task.getStateFromChildren()` and the
 * promise will be rejected if the state evaluates to error.
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
        func(item, task)
          .then(resolve)
          .catch(resolve);
      }));
    }
    Promise.all(promises).then((values) => {
      task.complete = true;
      if (autoCalculateTaskState) {
        task.state = task.getStateFromChildren();
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
