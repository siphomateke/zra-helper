import store from '@/store';
import { TaskState, TaskId, TaskVuexStateOptional } from '@/store/modules/tasks';
import createTask, { TaskObject } from '@/transitional/tasks';
import config from '@/transitional/config';
import {
  getDocumentByAjax,
  createTabFromRequest,
  tabLoaded,
  saveAsMHTML,
  closeTab,
  monitorDownloadProgress,
  startDownload,
  runContentScript,
  CreateTabRequestOptions,
  createTabFromHtml,
} from '../utils';
import {
  taxPayerSearchTaxTypeNamesMap,
  BrowserCode,
  TaxTypeNumericalCode,
  TPIN,
  Client,
  TaxAccountName,
  ZraDomain,
} from '../constants';
import { getCurrentBrowser, RequiredBy, Omit } from '@/utils';
import { parseTable, ParsedTableRecord } from '../content_scripts/helpers/zra';
import { getElementFromDocument } from '../content_scripts/helpers/elements';
import { Store } from 'vuex';
import getSingleFileHtmlBlob from '../html_bundler';
import { ImagesInTabFailedToLoad } from '../errors';
import { LoadedImagesResponse } from '@/backend/content_scripts/helpers/images';

/**
 * @template C catchErrors value
 */
interface TaskFunctionOptions<R, C extends boolean> {
  task: TaskObject;
  func: () => Promise<R>;
  /** Whether the task's state should be set after completing without errors. */
  setState?: boolean;
  setStateBasedOnChildren?: boolean;
  catchErrors?: C;
}

export async function taskFunction<R, T extends boolean>(options: RequiredBy<TaskFunctionOptions<R, T>, 'catchErrors'>): Promise<T extends true ? R | null : R>;
export async function taskFunction<R>(options: TaskFunctionOptions<R, any>): Promise<R>;
/**
 * Sets a task's state, error and completion status based on an async function.
 *
 * If the function throws an error, the task's error is set. Otherwise, the task's state is set to
 * success or is determined from it's sub tasks. Regardless of whether an error was thrown, the
 * task's completion status is set to true once the function is done running.
 */
export async function taskFunction<R>({
  task,
  func,
  setState = true,
  setStateBasedOnChildren = false,
  catchErrors = false,
}: TaskFunctionOptions<R, boolean>): Promise<R | null> {
  try {
    const response = await func();
    if (setState) {
      if (setStateBasedOnChildren) {
        task.setStateBasedOnChildren();
      } else {
        task.state = TaskState.SUCCESS;
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
 * @template I Current item in the loop.
 * @template R Parallel task map function response
 *
 * @param item This can either be an item from the list if one is provided, or an index if count
 * is provided.
 * FIXME: Document parameters somehow.
 */
type ParallelTaskMapFunction<I, R> = (item: I, parentTaskId: number) => Promise<R>;

interface MultipleResponsesError {
  /** The error that occurred getting this item if there was one. */
  error: any;
  value?: never;
}

interface MultipleResponsesValue<R> {
  /** The actual response for this item. */
  value: R;
  error?: never;
}

// FIXME: Make sure these responses don't have values when they have errors and vice-versa.
// Currently, if you check if `value` is defined, `error` is still present when it should
// be undefined.
export type MultipleResponses<R> = MultipleResponsesError | MultipleResponsesValue<R>;

export type ParallelTaskMapResponse<R, I> =
  MultipleResponses<R> & {
    /** The corresponding item from the list or index that this response came from. */
    item: I;
  };

interface ParallelTaskMapFnOptionsBase<I, R> {
  /** Optional index to start looping from */
  startIndex?: number;
  /** The parent task */
  task: TaskObject;
  /** The function to run on each list item */
  func: ParallelTaskMapFunction<I, R>;
  /**
   * Set this to false to disable the parent task's state from being automatically
   * set when all the async functions have completed.
   *
   * If this is true, the state will be set based on the task's children by
   * `task.setStateBasedOnChildren()` and the promise will be rejected if the state evaluates to
   * error.
   */
  autoCalculateTaskState?: boolean;
  /** Set to true to always resolve even if all tasks failed. */
  neverReject?: boolean;
  /**
   * Whether the task's max progress should be set based on the number of items in the list or the
   * count provided.
   *
   * Set this to false if the task is used for more than just this parallelTaskMap. If set to false,
   * the task's max progress must be manually set to include the total number of task's that will
   * be created by parallelTaskMap.
   */
  setTaskMaxProgress?: boolean;
}

/**
 * Describes the relationship between ParallelTaskMapFnOption's `list` and `count` properties.
 * One or none of the two properties can be provided.
 */
type ParallelTaskMapFnListCountOptions<ListItem, Count extends number | undefined> = {
  /** The list to loop through */
  list: Array<ListItem>;
  count?: never;
} | {
  /** The number of times to run. This is can be provided instead of a list. */
  count: Count;
  list?: never;
};

type ParallelTaskMapFnOptions<Response, ListItem, Count extends number | undefined> =
  ParallelTaskMapFnOptionsBase<Count extends undefined ? ListItem : number, Response>
  & ParallelTaskMapFnListCountOptions<ListItem, Count>;

/**
 * Loops through a list or `count` number of times and runs a provided function asynchronously
 * on each item in the list or index.
 *
 * The provided parent task will be automatically configured.
 * @returns
 * An array containing responses from `func`. The responses contain the actual values returned
 * or the the errors encountered trying to get the responses.
 */
export function parallelTaskMap<
  Response,
  ListItem,
  Item extends Count extends undefined ? ListItem : number,
  Count extends number | undefined = undefined
>({
  list,
  startIndex = 0,
  count,
  task,
  func,
  autoCalculateTaskState = true,
  neverReject = false,
  setTaskMaxProgress = true,
}: ParallelTaskMapFnOptions<Response, ListItem, Count>):
  Promise<Array<ParallelTaskMapResponse<Response, Item>>> {
  return new Promise((resolve, reject) => {
    task.sequential = false;
    task.unknownMaxProgress = false;

    let listMode = true;
    let loopCount = null;
    if (typeof list !== 'undefined') {
      loopCount = list.length;
    } else if (typeof count !== 'undefined') {
      loopCount = <number>count;
      listMode = false;
    } else {
      // eslint-disable-next-line max-len
      throw new Error(
        "Invalid parameters: Please provide either a 'list' to loop over or a 'count' as the number of times to loop.",
      );
    }

    // In case the task was already used for some other things, don't assume progressMax will not
    // have already beens set.
    if (setTaskMaxProgress) {
      task.progressMax = loopCount;
    }
    const promises: Promise<ParallelTaskMapResponse<Response, Item>>[] = [];
    for (let i = startIndex; i < loopCount; i++) {
      // if not in list mode, item is the index
      const item: Item = <Item>(listMode ? list![i] : i);
      promises.push(
        new Promise((resolve) => {
          func(item, task.id)
            .then((value) => {
              resolve({ item, value });
            })
            .catch((error) => {
              resolve({ item, error });
            });
        }),
      );
    }
    Promise.all(promises).then((responses) => {
      task.markAsComplete();
      if (autoCalculateTaskState) {
        task.setStateBasedOnChildren();
        if (task.state === TaskState.ERROR) {
          task.setErrorBasedOnChildren();
        }
        if (!neverReject && task.state === TaskState.ERROR) {
          reject(task.error);
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
 * Function that generates a task's options given a page number and a parent task ID.
 */
export type GetTaskData = (page: number, parentTaskId: TaskId) => TaskVuexStateOptional;

export interface GetDataFromPageFunctionReturn<R> {
  numPages: number;
  value: R;
}

export type GetDataFromPageFunction<R> = (
  page: number
) => Promise<GetDataFromPageFunctionReturn<R>>;

interface GetDataFromPageTaskFnOptions<R> {
  /** Function that generates a task's options given a page number and a parent task ID. */
  getTaskData: GetTaskData;
  /**
   * A function that when given a page number will return the data from that page including the
   * total number of pages.
   */
  getDataFunction: GetDataFromPageFunction<R>;
  parentTaskId: TaskId;
  /** The page to get data from. */
  page: number;
}

/**
 * Creates a task to get data from a single page.
 * This is mainly used by getPageData
 * @see getPagedData
 */
export async function getDataFromPageTask<R>({
  getTaskData,
  getDataFunction,
  parentTaskId,
  page,
}: GetDataFromPageTaskFnOptions<R>): Promise<GetDataFromPageFunctionReturn<R>> {
  const childTask = await createTask(store, getTaskData(page, parentTaskId));
  return taskFunction({
    task: childTask,
    func: () => getDataFunction(page),
  });
}

type PagedDataResponse<R> = MultipleResponses<R> & {
  page: number;
};

interface GetPagedDataFnOptions<R> {
  /** The task to use to contain all the subtasks that get data from multiple pages. */
  task: TaskObject;
  getPageSubTask: GetTaskData;
  /**
   * A function that when given a page number will return the data from that page including the
   * total number of pages.
   */
  getDataFunction: GetDataFromPageFunction<R>;
  /** The index of the first page. */
  firstPage?: number;
  /** Specific page numbers to get. If not set, all pages will be fetched. */
  pages?: number[];
}

/**
 * Gets data from several pages in parallel.
 */
export async function getPagedData<R>({
  task,
  getPageSubTask,
  getDataFunction,
  firstPage = 1,
  pages = [],
}: GetPagedDataFnOptions<R>): Promise<PagedDataResponse<R>[]> {
  const options = {
    getTaskData: getPageSubTask,
    getDataFunction,
  };

  const parallelTaskMapOptions: Omit<ParallelTaskMapFnOptions<
    GetDataFromPageFunctionReturn<R>,
    number,
    any
  >, 'count' | 'list'> = {
    task,
    func: (page, parentTaskId) => getDataFromPageTask(
      Object.assign(
        {
          page,
          parentTaskId,
        },
        options,
      ),
    ),
    neverReject: true,
  };

  return taskFunction({
    task,
    setState: false,
    async func() {
      const allResults: PagedDataResponse<R>[] = [];
      let results = null;

      // If no specific pages have been requested, figure out how many pages there are and get all
      // of them.
      if (pages.length === 0) {
        // Get data from the first page so we know the total number of pages
        // NOTE: The settings set by parallel task map aren't set when this runs
        const result = await getDataFromPageTask(
          Object.assign(
            {
              page: firstPage,
              parentTaskId: task.id,
            },
            options,
          ),
        );
        allResults.push({ page: firstPage, value: result.value });

        // Then get the rest of the pages in parallel.
        task.status = `Getting data from ${result.numPages} page(s)`;
        // The task's max progress must be set here and not by parallelTaskMap because it will
        // not be aware of the first page.
        task.progressMax = result.numPages;
        results = await parallelTaskMap(
          Object.assign(parallelTaskMapOptions, {
            startIndex: firstPage + 1,
            count: result.numPages + firstPage,
            setTaskMaxProgress: false,
          }),
        );
      } else {
        // Get only the requested pages.
        task.status = `Getting data from ${pages.length} page(s)`;
        results = await parallelTaskMap(
          Object.assign(parallelTaskMapOptions, {
            list: pages,
          }),
        );
      }

      for (const result of results) {
        const response: PagedDataResponse<R> = { page: Number(result.item) } as PagedDataResponse<R>;
        if (!('error' in result)) {
          response.value = result.value.value;
        } else {
          response.error = result.error;
        }
        allResults.push(response);
      }

      return allResults;
    },
  });
}

/**
 *
 * @param accountName Must be lower case
 */
export function getTaxTypeIdFromAccountName(
  accountName: TaxAccountName,
): TaxTypeNumericalCode | null {
  /* The account name contains the name of the client and the name of the tax type separated
  by a hyphen. We can thus figure out the account's tax type ID from the account name.
  Account names can be in various formats;
  - "CLIENT NAME-INCOME TAX"
  - "CLIENT-NAME-INCOME TAX"
  - "CLIENT-WITHHOLDING TAX"
  - "CLIENT-WITHHOLDING TAX-02"
  */
  let taxTypeId = null;
  for (const taxTypeName of Object.keys(taxPayerSearchTaxTypeNamesMap)) {
    if (accountName.indexOf(taxTypeName) > -1) {
      taxTypeId = taxPayerSearchTaxTypeNamesMap[taxTypeName];
      break;
    }
  }
  return taxTypeId;
}

interface TaxAccountRecord {
  srNo: string;
  /** E.g. "john smith-income tax" */
  accountName: TaxAccountName;
  /** E.g. "1997-02-01" */
  effectiveDateOfRegistration: string;
  // FIXME: Find out new tax account statuses
  status: 'active' | 'cancelled' | 'suspended';
}

export interface TaxAccount extends TaxAccountRecord {
  taxTypeId: TaxTypeNumericalCode | null;
}

interface GetTaxAccountPageFnOptions {
  tpin: TPIN;
  page: number;
}

/**
 * Gets a single page of tax accounts.
 */
export async function getTaxAccountPage({
  tpin,
  page,
}: GetTaxAccountPageFnOptions): Promise<
  GetDataFromPageFunctionReturn<ParsedTableRecord<keyof TaxAccountRecord>[]>
> {
  // TODO: [performance] Don't get this page again since it's already the default after login
  const doc = await getDocumentByAjax({ url: `${ZraDomain}/taxpayer-details` });

  const tableWrapper = getElementFromDocument(
    doc,
    '#simpletable',
    'tax account table wrapper',
  );
  const parsedTableRecords = await parseTable({
    root: tableWrapper,
    headers: [
      'srNo',
      'taxType',
      'accountName',
      'effectiveDateOfRegistration',
      'status',
    ],
    recordSelector: 'tbody>tr',
  });
  return {
    numPages: 1, // ZRA V2 paginates using JavaScript so all the data is already there
    value: parsedTableRecords,
  };
}

interface GetTaxAccountsFnOptions<S> {
  store: Store<S>;
  parentTaskId: TaskId;
  tpin: TPIN;
}

/**
 * Gets the tax accounts of a client. This includes account names and registered tax types.
 */
export async function getTaxAccounts<S>({
  store,
  parentTaskId,
  tpin,
}: GetTaxAccountsFnOptions<S>): Promise<TaxAccount[]> {
  const task = await createTask(store, {
    title: 'Get tax accounts',
    parent: parentTaskId,
  });

  const getPageSubTask: GetTaskData = (page, subTaskParentId) => ({
    title: `Get tax accounts from page ${page}`,
    parent: subTaskParentId,
    indeterminate: true,
  });

  const pageResponses = await getPagedData({
    task,
    getPageSubTask,
    getDataFunction: page => getTaxAccountPage({ tpin, page }),
  });

  const processed: TaxAccount[] = [];
  for (const pageResponse of pageResponses) {
    if (!('error' in pageResponse)) {
      const records = pageResponse.value;
      for (const account of records) {
        const accountName = account.accountName.toLowerCase();

        const taxTypeId = getTaxTypeIdFromAccountName(accountName);

        let status = account.status.toLowerCase();
        // Replace "De-registered" with "Cancelled" since it's the same thing.
        status = status.replace('de-registered', 'cancelled');

        processed.push({
          srNo: account.srNo,
          accountName,
          effectiveDateOfRegistration: account.effectiveDateOfRegistration,
          status,
          taxTypeId,
        });
      }
    }
  }
  return processed;
}

const currentBrowser = getCurrentBrowser();
/**
 * Enables or disables lite mode for the ZRA website.
 * @param mode True is enabled. False is disabled.
 */
export async function changeLiteMode(mode: boolean) {
  // Firefox has a better way of controlling which resources are blocked so we don't need
  // to disable all resource loading.
  if (currentBrowser !== BrowserCode.FIREFOX && config.zraLiteMode) {
    await store.dispatch('setZraLiteMode', mode);
  }
}

/**
 * Gets a human readable client name that uses only the client's ID.
 */
export function getClientIdName(client: Client) {
  return `Client ${client.id}`;
}

/**
 * Gets a string that uniquely identifies a client. This is typically the client's name but if
 * the client has no name or `anonymous` is true, it will be a string containing the client's ID.
 */
export function getClientIdentifier(client: Client, anonymous: boolean = false): string {
  if (!client.name || anonymous) {
    return getClientIdName(client);
  }
  return client.name;
}

/**
 * Removes all client names, usernames and passwords from an output.
 * @return The output with clients anonymized.
 */
export function anonymizeClientsInOutput(output: string, clients: Client[]): string {
  // TODO: Measure how much impact this function has on performance.
  let anonymized = output;
  for (const client of clients) {
    if (client.name) {
      anonymized = anonymized.replace(new RegExp(client.name, 'g'), getClientIdName(client));
    }
    if (client.username) {
      anonymized = anonymized.replace(
        new RegExp(client.username, 'g'),
        `client_${client.id}_username`,
      );
    }
    if (client.password) {
      anonymized = anonymized.replace(new RegExp(client.password, 'g'), '********');
    }
  }
  return anonymized;
}

/**
 * Checks if all the images in a tab have loaded.
 */
async function imagesInTabHaveLoaded(tabId: number): LoadedImagesResponse {
  return runContentScript(tabId, 'find_unloaded_images');
}

type FilenameGenerator =
  (dataSource: browser.tabs.Tab | HTMLDocument) => Promise<string | string[]>;

interface BaseDownloadPageOptions {
  /**
   * Filename of the downloaded page.
   *
   * If an array of filenames is provided, multiple files will be downloaded.
   *
   * If a function is provided, it must return a string or array. It will be called with
   * the tab object of the page to be downloaded.
   */
  filename: string | string[] | FilenameGenerator;
  taskTitle: string;
  parentTaskId: TaskId;
}

interface DownloadPageByRequestOptions extends BaseDownloadPageOptions {
  createTabFromRequestOptions: CreateTabRequestOptions;
}

interface DownloadPageByDocumentOptions extends BaseDownloadPageOptions {
  htmlDocument: HTMLDocument;
  /** Original URL of `htmlDocument`. Used to get the correct URLs for the page's assets. */
  htmlDocumentUrl: string;
}

interface DownloadPageByUrl extends BaseDownloadPageOptions {
  downloadUrl: string;
}

type DownloadPageOptions =
  DownloadPageByRequestOptions | DownloadPageByDocumentOptions | DownloadPageByUrl;

/**
 * Downloads a page generated from a `HTMLDocument`.
 */
export async function downloadPage(options: DownloadPageByDocumentOptions): Promise<void>;
/**
 * Downloads a page generated from a POST request.
 */
export async function downloadPage(options: DownloadPageByRequestOptions): Promise<void>;
export async function downloadPage(options: DownloadPageByUrl): Promise<void>;
export async function downloadPage(options: DownloadPageOptions): Promise<void> {
  const { filename, taskTitle, parentTaskId } = options;

  /** Whether the filename of the downloaded page will be based on data within the page. */
  // TODO: TS: Make this a type guard somehow
  const filenameUsesPage = typeof filename === 'function';

  const task = await createTask(store, {
    title: taskTitle,
    parent: parentTaskId,
    unknownMaxProgress: false,
    progressMax: 3,
    status: 'Waiting for slot in queue',
  });
  // Extra step waiting for filename to generate from page.
  if (filenameUsesPage) task.progressMax += 1;
  // Extra steps waiting for tab to open and for all images in the tab to load.
  if (config.export.pageDownloadFileType === 'mhtml') task.progressMax += 2;

  let generatedFilename: string | string[];
  if (!filenameUsesPage) {
    generatedFilename = <string | string>filename;
  }
  return taskFunction({
    task,
    async func() {
      const downloads: { [filename: string]: Blob | string } = {};
      let fileTypeName = 'file';
      // TODO: Merge duplicate code
      if ('downloadUrl' in options) {
        if (Array.isArray(generatedFilename)) {
          for (const filename of generatedFilename) {
            downloads[filename] = options.downloadUrl;
          }
        } else {
          downloads[generatedFilename] = options.downloadUrl;
        }
      } else if (config.export.pageDownloadFileType === 'mhtml') {
        fileTypeName = 'MHTML file';
        task.status = 'Opening tab';
        // FIXME: Handle changing maxOpenTabs when downloading more gracefully.
        const initialMaxOpenTabs = config.maxOpenTabs;
        config.maxOpenTabs = config.maxOpenTabsWhenDownloading;
        let tab: browser.tabs.Tab;
        if ('createTabFromRequestOptions' in options) {
          tab = await createTabFromRequest(options.createTabFromRequestOptions);
        } else {
          tab = await createTabFromHtml(options.htmlDocument);
        }
        config.maxOpenTabs = initialMaxOpenTabs;
        try {
          task.addStep('Waiting for page to load');
          await tabLoaded(tab.id);
          task.addStep('Checking if all images have loaded');
          const loadInfo = await imagesInTabHaveLoaded(tab.id);
          if (!loadInfo.allLoaded) {
            throw new ImagesInTabFailedToLoad(
              `${loadInfo.unloadedImages.length} image(s) in the page failed to load`,
              null,
              { unloadedImages: loadInfo.unloadedImages },
            );
          }
          if (filenameUsesPage) {
            task.addStep('Generating filename');
            generatedFilename = await (<Function>filename)(tab);
          }
          task.addStep('Converting page to MHTML');
          const blob = await saveAsMHTML({ tabId: tab.id });
          if (Array.isArray(generatedFilename)) {
            for (const filename of generatedFilename) {
              downloads[filename] = blob;
            }
          } else {
            downloads[generatedFilename] = blob;
          }
        } finally {
          // TODO: Catch tab close errors
          closeTab(tab.id);
        }
      } else if (config.export.pageDownloadFileType === 'html') {
        fileTypeName = 'HTML file';
        let url: string;
        let doc: HTMLDocument;
        if ('createTabFromRequestOptions' in options) {
          task.status = 'Fetching page';
          doc = await getDocumentByAjax({
            method: 'post',
            ...options.createTabFromRequestOptions,
          });
          ({ url } = options.createTabFromRequestOptions);
        } else {
          doc = options.htmlDocument;
          url = options.htmlDocumentUrl;
        }
        if (filenameUsesPage) {
          task.addStep('Generating filename');
          generatedFilename = await (<Function>filename)(doc);
        }
        task.addStep('Bundling page into single HTML file');
        let filenames: string[];
        if (typeof generatedFilename === 'string') {
          filenames = [generatedFilename];
        } else {
          filenames = generatedFilename;
        }
        if (config.export.useFilenameAsHtmlPageTitle) {
          const promises: Promise<any>[] = [];
          for (const filename of filenames) {
            promises.push((async () => {
              downloads[filename] = await getSingleFileHtmlBlob(doc, url, filename);
            })());
          }
          await Promise.all(promises);
        } else {
          const blob = await getSingleFileHtmlBlob(doc, url);
          for (const filename of filenames) {
            downloads[filename] = blob;
          }
        }
      }

      task.addStep(`Downloading generated ${fileTypeName}`);

      const taskProgressBeforeDownload = task.progress;
      const promises: Promise<any>[] = [];
      for (const filename of Object.keys(downloads)) {
        // eslint-disable-next-line no-loop-func
        promises.push((async () => {
          if (typeof filename !== 'string') {
            throw new Error('Invalid filename attribute; filename must be a string, array or function.');
          }

          const download = downloads[filename];
          const url = download instanceof Blob ? URL.createObjectURL(download) : download;
          try {
            let downloadFilename = filename;
            if (
              config.export.pageDownloadFileType === 'mhtml'
              && !config.export.removeMhtmlExtension
            ) {
              downloadFilename += '.mhtml';
            } else if (config.export.pageDownloadFileType === 'html') {
              downloadFilename += '.html';
            }
            const downloadId = await startDownload({
              url,
              filename: downloadFilename,
            });
            task.addDownload(downloadId);
            await monitorDownloadProgress(downloadId, (downloadProgress: number) => {
              if (downloadProgress !== -1) {
                task.progress = taskProgressBeforeDownload + downloadProgress;
              }
            });
          } finally {
            if (download instanceof Blob) {
              URL.revokeObjectURL(url);
            }
          }
        })());
      }
      await Promise.all(promises);
    },
  });
}

interface DownloadPagesFnOptionsBase<I, R> extends Omit<ParallelTaskMapFnOptionsBase<I, R>, 'neverReject'> {
  /** Task that will be a parent to all the page downloading tasks. */
  task: TaskObject;
  /** Function called on each item in the array of data list that should download a page. */
  func: ParallelTaskMapFunction<I, R>;
}

type DownloadPagesFnOptions<Response, ListItem, Count extends number | undefined> =
  DownloadPagesFnOptionsBase<Count extends undefined ? ListItem : number, Response>
  & ParallelTaskMapFnListCountOptions<ListItem, Count>;

/**
 * Downloads multiple pages in parallel.
 */
export async function downloadPages<
  Response,
  ListItem,
  Count extends number | undefined = undefined
>(options: DownloadPagesFnOptions<Response, ListItem, Count>) {
  const initialMaxOpenTabs = config.maxOpenTabs;
  config.maxOpenTabs = config.maxOpenTabsWhenDownloading;
  const response = await parallelTaskMap({
    ...options,
    neverReject: true,
  });
  config.maxOpenTabs = initialMaxOpenTabs;
  return response;
}

/**
 * Disables lite mode so pages' assets are correctly downloaded.
 *
 * This could be done immediately before downloading a page but if many pages are being downloaded
 * it will be toggled very rapidly causing performance issues.
 */
export function startDownloadingPages() {
  return changeLiteMode(false);
}

/** Re-enables lite mode after downloading pages with assets. */
export function finishDownloadingPages() {
  return changeLiteMode(true);
}
