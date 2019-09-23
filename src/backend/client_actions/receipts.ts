import store from '@/store';
import createTask from '@/transitional/tasks';
import { InvalidReceiptError } from '../errors';
import { runContentScript } from '../utils';
import {
  getPagedData,
  GetDataFromPageFunction,
  ParallelTaskMapResponse,
  GetTaskData,
} from './utils';
import { TaskId } from '@/store/modules/tasks';

export type ReceiptType = 'payment' | 'ack_receipt';

/**
 * Extracts information from a receipt that has been opened in a tab.
 */
export async function getDataFromReceiptTab(tab: browser.tabs.Tab, type: ReceiptType) {
  const receiptData = await runContentScript(tab.id, 'get_receipt_data', { type });
  if (receiptData === null) {
    throw new InvalidReceiptError('Invalid receipt; failed to collect receipt data.');
  }
  return receiptData;
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
// TODO: Rename this to apply to downloading returns as well as return receipts.
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
          'Receipt data fetched from a page must be an array. For example, an array of reference numbers.',
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
