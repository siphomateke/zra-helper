import store from '@/store';
import { taskStates } from '@/store/modules/tasks';
import createTask from '@/transitional/tasks';
import config from '@/transitional/config';
import { InvalidReceiptError } from '../errors';
import {
  createTabPost,
  saveAsMHTML,
  tabLoaded,
  monitorDownloadProgress,
  closeTab,
  clickElement,
  runContentScript,
} from '../utils';
import { taxTypeNames } from '../constants';

/** @typedef {import('@/transitional/tasks').TaskObject} Task */

/**
 * Sets a task's state, error and completion status based on an async function.
 *
 * If the function throws an error, the task's error is set. Otherwise, the task's state is set to
 * success or is determined from it's sub tasks. Regardless of whether an error was thrown, the
 * task's completion status is set to true once the function is done running.
 * @template AsyncFunctionReturn
 * @param {Object} options
 * @param {import('@/transitional/tasks').TaskObject} options.task
 * @param {() => AsyncFunctionReturn} options.func
 * @param {boolean} [options.setState]
 * Whether the task's state should be set after completing without errors.
 * @param {boolean} [options.setStateBasedOnChildren]
 * @param {boolean} [options.catchErrors]
 * @returns {Promise<AsyncFunctionReturn>}
 */
export async function taskFunction({
  task,
  func,
  setState = true,
  setStateBasedOnChildren = false,
  catchErrors = false,
}) {
  try {
    const response = await func();
    if (setState) {
      if (setStateBasedOnChildren) {
        task.setStateBasedOnChildren();
      } else {
        task.state = taskStates.SUCCESS;
      }
    }
    return response;
  } catch (error) {
    task.setError(error);
    if (catchErrors) {
      return null;
    }
    throw error;
  } finally {
    task.markAsComplete();
  }
}

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
 * @callback ParallelTaskMapFunction
 * @param {Object|number} item
 * This can either be an item from the list if one is provided, or an index if count is provided.
 * @param {number} parentTaskId
 */

/**
 * Loops through a list or `count` number of times and runs a provided function asynchronously
 * on each item in the list or index.
 *
 * The provided parent task will be automatically configured.
 * @param {Object} options
 * @param {Array} [options.list] The list to loop through
 * @param {number} [options.startIndex] Optional index to start looping from
 * @param {number} [options.count]
 * The number of times to run. This is can be provided instead of a list.
 * @param {Task} options.task The parent task
 * @param {ParallelTaskMapFunction} options.func The function to run on each list item
 * @param {boolean} [options.autoCalculateTaskState=true]
 * Set this to false to disable the parent task's state from being automatically
 * set when all the async functions have completed.
 *
 * If this is true, the state will be set based on the task's children by
 * `task.setStateBasedOnChildren()` and the promise will be rejected if the state evaluates to
 * error.
 */
export function parallelTaskMap({
  list = null,
  startIndex = 0,
  count = null,
  task,
  func,
  autoCalculateTaskState = true,
}) {
  return new Promise((resolve, reject) => {
    task.sequential = false;
    task.unknownMaxProgress = false;

    let listMode = true;
    let loopCount = null;
    if (list !== null) {
      loopCount = list.length;
    } else if (count !== null) {
      loopCount = count;
      listMode = false;
    } else {
      // eslint-disable-next-line max-len
      throw new Error("Invalid parameters: Please provide either a 'list' to loop over or a 'count' as the number of times to loop.");
    }

    task.progressMax = loopCount;
    const promises = [];
    for (let i = startIndex; i < loopCount; i++) {
      // if not in list mode, item is the index
      const item = listMode ? list[i] : i;
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

/**
 * @callback GetTaskData
 * @param {number} page
 * @param {number} parentTaskId
 * @returns {import('@/store/modules/tasks').TaskVuexState}
 */

/**
 * @typedef {Object} GetDataFromPageFunctionReturn
 * @property {number} numPages
 */

/**
 * @callback GetDataFromPageFunction
 * @param {number} page
 * @returns {Promise.<GetDataFromPageFunctionReturn>}
 */

/**
 * Creates a task to get data from a single page.
 * This is mainly used by getPageData
 * @see getPagedData
 * @param {Object} options
 * @param {GetTaskData} options.getTaskData
 * Function that generates a task's options given a page number and a parent task ID.
 * @param {GetDataFromPageFunction} options.getDataFunction
 * A function that when given a page number will return the data from that page including the total
 * number of pages.
 * @param {number} options.parentTaskId
 * @param {number} options.page The page to get data from.
 * @param {number} [options.firstPage=1] The index of the first page.
 * @returns {Promise.<GetDataFromPageFunctionReturn>}
 */
export async function getDataFromPageTask({
  getTaskData,
  getDataFunction,
  parentTaskId,
  page,
  firstPage = 1,
}) {
  const childTask = await createTask(store, getTaskData(page, parentTaskId));
  return taskFunction({
    task: childTask,
    func: () => getDataFunction(page + firstPage),
  });
}

/**
 * Gets data from several pages in parallel.
 * @param {Object} options
 * @param {import('@/transitional/tasks').TaskObject} options.task
 * The task to use to contain all the subtasks that get data from multiple pages.
 * @param {GetTaskData} options.getPageSubTask
 * @param {GetDataFromPageFunction} options.getDataFunction
 * A function that when given a page number will return the data from that page including the total
 * number of pages.
 * @param {number} [options.firstPage] The index of the first page.
 */
// TODO: Use me in more places such has payment history
export function getPagedData({
  task,
  getPageSubTask,
  getDataFunction,
  firstPage = 1,
}) {
  return taskFunction({
    task,
    setState: false,
    async func() {
      const options = {
        getTaskData: getPageSubTask,
        getDataFunction,
        firstPage,
      };

      const allResults = [];

      // Get data from the first page so we know the total number of pages
      // NOTE: The settings set by parallel task map aren't set when this runs
      const result = await getDataFromPageTask(Object.assign({
        page: 0,
        parentTaskId: task.id,
      }, options));
      allResults.push(result);

      // Then get the rest of the pages in parallel
      const results = await parallelTaskMap({
        startIndex: 1,
        count: result.numPages,
        task,
        func(page, parentTaskId) {
          return getDataFromPageTask(Object.assign({
            page,
            parentTaskId,
          }, options));
        },
      });
      allResults.push(...results);

      return allResults;
    },
  });
}

/**
 * Gets the registered tax types of a client.
 * @param {Object} options
 * @param {import('vuex').Store} options.store
 * @param {number} options.parentTaskId
 * @param {number} options.loggedInTabId
 * The ID of a tab in which the client you wish to get tax types for has been logged into.
 * @returns {Promise.<import('@/backend/constants').TaxTypeNumericalCode[]>}
 */
export async function getTaxTypes({ store, parentTaskId, loggedInTabId }) {
  const task = await createTask(store, {
    title: 'Get registered tax types',
    parent: parentTaskId,
    progressMax: 4,
  });

  return taskFunction({
    task,
    // TODO: Find out why we were catching errors
    catchErrors: true,
    async func() {
      task.addStep('Navigating to taxpayer profile');
      await clickElement(
        loggedInTabId,
        // eslint-disable-next-line max-len
        '#leftMainDiv .leftMenuAccordion div.submenu:nth-child(8)>ul:nth-child(1)>li:nth-child(1)>div:nth-child(1)>a:nth-child(1)',
        'go to taxpayer profile button',
      );

      task.addStep('Waiting for taxpayer profile to load');
      await tabLoaded(loggedInTabId);

      task.addStep('Extracting tax types');
      const { registrationDetails } = await runContentScript(loggedInTabId, 'get_registration_details');

      // Get only registered tax types
      const registeredTaxTypes = [];
      for (const { status, taxType } of registrationDetails) {
        if (status.toLowerCase() === 'registered') {
          const taxTypeId = taxTypeNames[taxType.toLowerCase()];
          registeredTaxTypes.push(taxTypeId);
        }
      }
      return registeredTaxTypes;
    },
  });
}
