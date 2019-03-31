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
  CreateTabPostOptions,
} from '../utils';
import {
  changeLiteMode,
  parallelTaskMap,
  taskFunction,
  getPagedData,
  GetDataFromPageFunction,
  MultipleResponses,
  ParallelTaskMapResponse,
  GetTaskData,
} from './utils';
import { TaskId } from '@/store/modules/tasks';

export interface DownloadReceiptOptions {
  type: 'return' | 'payment';
  /**
   * Filename of the downloaded receipt.
   *
   * If an array of filenames is provided, multiple files will be downloaded.
   *
   * If a function is provided, it must return a string or array. It will be called with
   * an object containing information about the receipt such as reference number.
   */
  filename: string | string[] | Function;
  taskTitle: string;
  parentTaskId: TaskId;
  createTabPostOptions: CreateTabPostOptions;
}

/**
 * Downloads a receipt
 */
export async function downloadReceipt({
  type,
  filename,
  taskTitle,
  parentTaskId,
  createTabPostOptions,
}: DownloadReceiptOptions): Promise<void> {
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
      // FIXME: Add a type to this
      let receiptData = null;
      let blob: Blob | null = null;
      try {
        task.addStep('Waiting for receipt to load');
        await tabLoaded(tab.id);

        receiptData = await runContentScript(tab.id, 'get_receipt_data', {
          type,
        });

        if (!receiptData.referenceNumber) {
          throw new InvalidReceiptError('Invalid receipt; missing reference number.');
        }

        task.addStep('Converting receipt to MHTML');
        blob = await saveAsMHTML({ tabId: tab.id });
      } finally {
        // TODO: Catch tab close errors
        closeTab(tab.id);
      }
      if (receiptData !== null && blob !== null) {
        const url = URL.createObjectURL(blob);
        task.addStep('Downloading generated MHTML');

        let generatedFilename: string | string[];
        if (typeof filename === 'function') {
          generatedFilename = filename(receiptData);
        } else {
          generatedFilename = filename;
        }
        let generatedFilenames: string[];
        if (typeof generatedFilename === 'string') {
          generatedFilenames = [generatedFilename];
        } else {
          generatedFilenames = generatedFilename;
        }
        const taskProgressBeforeDownload = task.progress;
        if (Array.isArray(generatedFilenames)) {
          const promises: Promise<void>[] = [];
          for (const generatedFilename of generatedFilenames) {
            promises.push(
              new Promise(async resolve => {
                let downloadFilename = generatedFilename;
                if (!config.export.removeMhtmlExtension) {
                  downloadFilename += '.mhtml';
                }
                const downloadId = await browser.downloads.download({
                  url,
                  filename: downloadFilename,
                });
                // FIXME: Catch and handle download errors
                await monitorDownloadProgress(downloadId, downloadProgress => {
                  if (downloadProgress !== -1) {
                    task.progress = taskProgressBeforeDownload + downloadProgress;
                  }
                });
                resolve();
              })
            );
          }
          await Promise.all(promises);
        } else {
          throw new Error(
            'Invalid filename attribute; filename must be a string, array or function.'
          );
        }
      }
    },
  });
}

/** Gets the options to use in downloadReceipts from an item. */
type GetDownloadReceiptOptionsFunc<ListItem> = (
  item: ListItem,
  parentTaskId: TaskId
) => DownloadReceiptOptions;

interface DownloadReceiptsOptions<ListItem> {
  /** Title of the task that will be a parent to all the receipt downloading tasks. */
  taskTitle: string;
  parentTaskId: TaskId;
  /** Array of data to use when downloading receipts. */
  list: Array<ListItem>;
  /**
   * Function that returns the options that will be passed to `downloadReceipts`. It's called on each
   * item in the array of data list.
   */
  getDownloadReceiptOptions: GetDownloadReceiptOptionsFunc<ListItem>;
}

/**
 * Downloads multiple receipts in parallel.
 */
export async function downloadReceipts<ListItem>({
  taskTitle = 'Download receipts',
  parentTaskId,
  list,
  getDownloadReceiptOptions: downloadReceiptFunc,
}: DownloadReceiptsOptions<ListItem>) {
  const task = await createTask(store, {
    title: taskTitle,
    parent: parentTaskId,
  });
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

interface GetReceiptDataResponse<R> {
  /** The receipt data fetched from all pages in a single flat array. */
  data: R;
  /** Pages from which receipt data could not be fetched. */
  failedPages: number[];
}

interface GetReceiptDataFnOptions<Response> {
  parentTaskId: TaskId;
  /** Title of the main task. */
  taskTitle: string;
  /** Function that generates the title of a page task using a page number. */
  getPageTaskTitle: (page: number) => string;
  getDataFunction: GetDataFromPageFunction<Response[]>;
  /** Specific pages to fetch. */
  pages: number[];
}

/**
 * Gets data from multiple pages that is required to download receipts.
 */
export async function getReceiptData<Response>({
  parentTaskId,
  taskTitle,
  getPageTaskTitle,
  getDataFunction,
  pages = [],
}: GetReceiptDataFnOptions<Response>): Promise<GetReceiptDataResponse<Response[]>> {
  const task = await createTask(store, {
    title: taskTitle,
    parent: parentTaskId,
  });

  const getPageSubTask: GetTaskData = (page, subTaskParentId) => ({
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

  const data: Response[] = [];
  const failedPages: number[] = [];
  for (const response of responses) {
    if (!('error' in response)) {
      if (Array.isArray(response.value)) {
        data.push(...response.value);
      } else {
        throw new Error(
          'Receipt data fetched from a page must be an array. For example, an array of reference numbers.'
        );
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
export function getFailedResponseItems<R, I>(downloadResponses: ParallelTaskMapResponse<R, I>[]) {
  const items = [];
  for (const response of downloadResponses) {
    if ('error' in response) {
      items.push(response.item);
    }
  }
  return items;
}
