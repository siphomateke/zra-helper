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
  runContentScript,
  getDocumentByAjax,
} from '../utils';
import { taxPayerSearchTaxTypeNames, browserCodes } from '../constants';
import { getCurrentBrowser } from '@/utils';
import { parseTableAdvanced } from '../content_scripts/helpers/zra';
import { getElementFromDocument } from '../content_scripts/helpers/elements';

/**
 * @typedef {import('@/transitional/tasks').TaskObject} Task
 * @typedef {import('../constants').Client} Client
 */

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
 * @template R The type of the returned value.
 * @callback ParallelTaskMapFunction
 * @param {Object|number} item
 * This can either be an item from the list if one is provided, or an index if count is provided.
 * @param {number} parentTaskId
 * @returns {Promise.<R>}
 */

/**
 * @template R
 * @typedef {Object} ParallelTaskMapResponse
 * @property {string|number} item
 * The corresponding item from the list or index that this response came from.
 * @property {R} [value] The actual response for this item.
 * @property {any} [error] The error that occurred getting this item if there was one.
 */

/**
 * Loops through a list or `count` number of times and runs a provided function asynchronously
 * on each item in the list or index.
 *
 * The provided parent task will be automatically configured.
 * @template R
 * @param {Object} options
 * @param {Array} [options.list] The list to loop through
 * @param {number} [options.startIndex] Optional index to start looping from
 * @param {number} [options.count]
 * The number of times to run. This is can be provided instead of a list.
 * @param {Task} options.task The parent task
 * @param {ParallelTaskMapFunction<R>} options.func The function to run on each list item
 * @param {boolean} [options.autoCalculateTaskState=true]
 * Set this to false to disable the parent task's state from being automatically
 * set when all the async functions have completed.
 *
 * If this is true, the state will be set based on the task's children by
 * `task.setStateBasedOnChildren()` and the promise will be rejected if the state evaluates to
 * error.
 * @returns {Promise.<ParallelTaskMapResponse<R>[]>}
 * An array containing responses from `func`. The responses contain the actual values returned
 * or the the errors encountered trying to get the responses.
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
          .then((value) => {
            resolve({ item, value });
          })
          .catch((error) => {
            resolve({ item, error });
          });
      }));
    }
    Promise.all(promises).then((responses) => {
      task.markAsComplete();
      if (autoCalculateTaskState) {
        task.setStateBasedOnChildren();
        if (task.state === taskStates.ERROR) {
          reject();
        } else {
          resolve(responses);
        }
      } else {
        resolve(responses);
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
 * @returns {Object.<number, any>} Results of the getDataFunction mapped to pages.
 */
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

      const allResults = {};

      // Get data from the first page so we know the total number of pages
      // NOTE: The settings set by parallel task map aren't set when this runs
      const result = await getDataFromPageTask(Object.assign({
        page: 0,
        parentTaskId: task.id,
      }, options));
      allResults[firstPage] = result;

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

      for (const result of results) {
        if (!('error' in result)) {
          const page = result.item;
          const actualPage = Number(page) + firstPage;
          allResults[actualPage] = result.value;
        }
      }

      return allResults;
    },
  });
}

/**
 * @typedef {Object} TaxAccount
 * @property {string} srNo
 * @property {import('@/backend/constants').TaxTypeNumericalCode} taxTypeId
 * @property {string} accountName E.g. "john smith-income tax"
 * @property {string} effectiveDateOfRegistration E.g. "1997-02-01"
 * @property {string} effectiveCancellationDate E.g. "2014-07-25"
 * @property {string} status ("registered"|"cancelled"|"suspended")
 */

/**
 * Gets a single page of tax accounts.
 * @param {Object} options
 * @param {string} options.tpin
 * @param {number} options.page
 * @returns {Promise.<import('../content_scripts/helpers/zra').ParsedTable>}
 */
export async function getTaxAccountPage({ tpin, page }) {
  const doc = await getDocumentByAjax({
    url: 'https://www.zra.org.zm/WebContentMgmt.htm',
    method: 'post',
    data: {
      actionCode: 'getTaxPayerRegistrationDetail',
      tpinNo: tpin,
      currentPage: page,
    },
  });

  const tableWrapper = getElementFromDocument(
    doc,
    '[name="interestRateForm"] table:nth-of-type(2)>tbody>tr:nth-child(2)>td',
    'tax account table wrapper',
  );
  const parsedTable = await parseTableAdvanced({
    root: tableWrapper,
    headers: [
      'srNo',
      'accountName',
      'effectiveDateOfRegistration',
      'status',
      'effectiveCancellationDate',
    ],
    recordSelector: 'table:nth-of-type(2)>tbody>tr:not(:first-child)',
    tableInfoSelector: 'table.pagebody>tbody>tr>td',
    /* TODO: There is always at least one tax account. Because of the this, the no records string
    should not be checked. */
  });
  return parsedTable;
}

/**
 * Gets the tax accounts of a client. This includes account names and registered tax types.
 * @param {Object} options
 * @param {import('vuex').Store} options.store
 * @param {number} options.parentTaskId
 * @param {string} options.tpin
 * The ID of a tab that is logged into the client whose tax accounts should be acquired.
 * @returns {Promise.<TaxAccount[]>}
 */
export async function getTaxAccounts({ store, parentTaskId, tpin }) {
  const task = await createTask(store, {
    title: 'Get tax accounts',
    parent: parentTaskId,
  });

  const getPageSubTask = (page, subTaskParentId) => ({
    title: `Get tax accounts from page ${page + 1}`,
    parent: subTaskParentId,
    indeterminate: true,
  });

  const allResponses = await getPagedData({
    task,
    getPageSubTask,
    getDataFunction: page => getTaxAccountPage({ tpin, page }),
  });

  const processed = [];
  for (const response of Object.values(allResponses)) {
    for (const account of response.records) {
      const accountName = account.accountName.toLowerCase();
      // The account name contains the name of the client and the name of the tax type separated by
      // a hyphen. We can thus figure out the account's tax type ID from the account name.
      const [, taxTypeName] = accountName.split('-');
      const taxTypeId = taxPayerSearchTaxTypeNames[taxTypeName];

      let status = account.status.toLowerCase();
      // Replace "De-registered" with "Cancelled" since it's the same thing.
      status = status.replace('de-registered', 'cancelled');

      processed.push({
        srNo: account.srNo,
        accountName,
        effectiveDateOfRegistration: account.effectiveDateOfRegistration,
        status,
        effectiveCancellationDate: account.effectiveCancellationDate,
        taxTypeId,
      });
    }
  }
  return processed;
}

const currentBrowser = getCurrentBrowser();
async function changeLiteMode(mode) {
  // Firefox has a better way of controlling which resources are blocked so we don't need
  // to disable all resource loading.
  if (currentBrowser !== browserCodes.FIREFOX && config.zraLiteMode) {
    await store.dispatch('setZraLiteMode', mode);
  }
}

export function startDownloadingReceipts() {
  return changeLiteMode(false);
}

export async function finishDownloadingReceipts() {
  return changeLiteMode(true);
}

/**
 * Gets a human readable client name that uses only the client's ID.
 * @param {Client} client
 * @returns {string}
 */
export function getClientIdName(client) {
  return `Client ${client.id}`;
}

/**
 * Gets a string that uniquely identifies a client. This is typically the client's name but if
 * the client has no name or `anonymous` is true, it will be a string containing the client's ID.
 * @param {Client} client
 * @param {boolean} [anonymous=false]
 * @returns {string}
 */
export function getClientIdentifier(client, anonymous = false) {
  if (!client.name || anonymous) {
    return getClientIdName(client);
  }
  return client.name;
}

/**
 * Removes all client names, usernames and passwords from an output.
 * @param {string} output
 * @param {Client[]} clients
 * @return {string}
 */
export function anonymizeClientsInOutput(output, clients) {
  // TODO: Measure how much impact this function has on performance.
  let anonymized = output;
  for (const client of clients) {
    anonymized = anonymized.replace(new RegExp(client.name, 'g'), getClientIdName(client));
    anonymized = anonymized.replace(new RegExp(client.username, 'g'), `client_${client.id}_username`);
    anonymized = anonymized.replace(new RegExp(client.password, 'g'), '********');
  }
  return anonymized;
}
