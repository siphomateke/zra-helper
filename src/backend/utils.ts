import axios, { AxiosRequestConfig } from 'axios';
import config from '@/transitional/config';
import store from '@/store';
import { getCurrentBrowser } from '@/utils';
import xml2js from 'xml2js';
import { getZraError } from './content_scripts/helpers/zra';
import {
  errorFromJson,
  ExecuteScriptError,
  SendMessageError,
  TabError,
  DownloadError,
} from './errors';
import { BrowserCode } from './constants';
import PromiseQueue from './promise_queue';
import {
  ContentScriptCommand,
  ContentScriptMessageFromCommand,
  ContentScriptResponseFromCommand,
} from './content_scripts/commands/types';

/**
 * Waits for a specific message.
 * @param validator Function that checks if a message is the one we are waiting for
 */
export function waitForMessage(validator: (message: string) => boolean) {
  return new Promise(async (resolve) => {
    function listener(message: string) {
      if (validator(message)) {
        browser.runtime.onMessage.removeListener(listener);
        resolve(message);
      }
    }
    browser.runtime.onMessage.addListener(listener);
  });
}

/**
 * Sends a single message to the content script(s) in the specified tab.
 * Also throws any errors received as messages.
 * @throws {SendMessageError}
 */
export async function sendMessage(tabId: number, message: any) {
  let response;
  try {
    response = await browser.tabs.sendMessage(tabId, message);
  } catch (error) {
    const errorString = error.message ? error.message : error.toString();
    throw new SendMessageError(
      `Failed to send message to tab with ID ${tabId}: "${errorString}"`,
      null,
      { tabId },
    );
  }
  if (typeof response !== 'undefined' && response.error) {
    throw errorFromJson(response.error);
  }
  return response;
}

/**
 * Executes a script in a particular tab
 * @param filename The name of the script to execute excluding the extension.
 * @throws {ExecuteScriptError}
 */
export async function executeScript(tabId: number, filename: string, vendor: boolean = false) {
  if (filename) {
    if (!vendor) {
      filename = `content_scripts/commands/${filename}`;
    } else {
      filename = `vendor/${filename}`;
    }
    filename += '.js';
  }
  try {
    await browser.tabs.executeScript(tabId, { file: filename });
    if (config.debug.sendConfigToContentScripts) {
      try {
        await sendMessage(tabId, {
          command: 'receive_config',
          config: store.state.config,
        });
      } catch (e) {
        // Don't worry if the message isn't received.
        if (!(
          e.type === 'SendMessageError'
          && e.message.toLowerCase().includes('receiving end does not exist')
        )) {
          throw e;
        }
      }
    }
  } catch (error) {
    const errorString = error.message ? error.message : error.toString();
    // If the extension does not have permission to execute a script on this tab,
    // then this tab is probably the browser error page which usually only
    // shows up when the user is offline.
    if (error.message) {
      if (
        error.message.includes('Cannot access contents of url "chrome-error://chromewebdata/"')
        || error.message.includes('Missing host permission for the tab')
      ) {
        throw new ExecuteScriptError(
          `Cannot access tab with ID ${tabId}. Please check your internet connection and try again.`,
          'NoAccess',
          { tabId },
        );
      }
    }
    throw new ExecuteScriptError(`Failed to execute script: "${errorString}"`, null, { tabId });
  }
}

/**
 * Executes a script in a tab and sends a message to it.
 * @param id
 * A string that is both the filename of the script and the command that will be sent to trigger
 * the script.
 * @param message Message that will be sent to the script.
 */
export async function runContentScript<
  C extends ContentScriptCommand,
  M extends ContentScriptMessageFromCommand<C>,
  R extends ContentScriptResponseFromCommand<C, M>
>(
  tabId: number,
  id: C,
  // FIXME: Make message type not include command
  message: M | object = {},
): Promise<R | object> {
  await executeScript(tabId, id);
  const response = await sendMessage(tabId, {
    command: id,
    ...message,
  });
  return response;
}

type QueueId = number;
type TabId = number;

// TODO: Merge with PromiseQueue
class TabCreator {
  /** Array of IDs of tabs created by the extension which are currently open. */
  tabs: TabId[] = [];

  /** The number of tabs that are currently open. */
  openTabsCount: number = 0;

  lastTabOpenTime: number | null = null;

  /**
   * Array of callbacks that are called with a queue ID when there is a free slot.
   * They are only created and added by `waitForFreeTabSlot` which converts them to promises.
   */
  queue: ((queueId: QueueId) => void)[] = [];

  drainingQueue: boolean = false;

  lastQueueId: QueueId = 0;

  /** IDs of queues that have loading tabs */
  loadingQueueIds: QueueId[] = [];

  /** Maps queue IDs to tab IDs/ */
  queueIdsByTabId: { [queueId: number]: TabId } = {};

  constructor() {
    browser.tabs.onRemoved.addListener((tabId) => {
      if (this.tabs.includes(tabId)) {
        this.removeLoadingTab(tabId);
        this.openTabsCount--;
        this.tabs.splice(this.tabs.indexOf(tabId), 1);
        this.drainQueue();
      }
    });

    browser.tabs.onUpdated.addListener((tabId, { status }) => {
      if ((status === 'complete' || 'loading') && this.tabs.includes(tabId)) {
        if (status === 'complete') {
          this.removeLoadingTab(tabId);
        } else if (status === 'loading') {
          this.addLoadingTab(tabId);
        }
        this.drainQueue();
      }
    });
  }

  /**
   * Adds the specified tab to the loading tabs count.
   */
  addLoadingTab(tabId: TabId) {
    if (tabId in this.queueIdsByTabId) {
      const queueId = this.queueIdsByTabId[tabId];
      if (!this.loadingQueueIds.includes(queueId)) {
        this.loadingQueueIds.push(queueId);
      }
    }
  }

  /**
   * Removes the specified tab from the loading tabs count.
   */
  removeLoadingTab(tabId: TabId) {
    if (tabId in this.queueIdsByTabId) {
      const queueId = this.queueIdsByTabId[tabId];
      const index = this.loadingQueueIds.indexOf(queueId);
      if (index > -1) {
        this.loadingQueueIds.splice(index, 1);
      }
    }
  }

  /**
   * The number of tabs that are currently loading.
   */
  get loadingTabsCount(): number {
    return this.loadingQueueIds.length;
  }

  /**
   * Checks if a tab can be opened.
   */
  slotFree(): boolean {
    const notMaxOpenTabs = config.maxOpenTabs === 0
      || this.openTabsCount < config.maxOpenTabs;

    const notMaxLoadingTabs = config.maxLoadingTabs === 0
      || this.loadingTabsCount < config.maxLoadingTabs;

    const timeSinceLastTabOpened = Date.now() - this.lastTabOpenTime;
    const delayLargeEnough = (
      this.lastTabOpenTime === null
      || timeSinceLastTabOpened >= config.tabOpenDelay
    );

    return notMaxOpenTabs && notMaxLoadingTabs && delayLargeEnough;
  }

  /**
   * Loops through pending tabs and checks if they can be created.
   */
  drainQueue() {
    if (!this.drainingQueue) {
      this.drainingQueue = true;
      while (this.queue.length > 0 && this.slotFree()) {
        const callback = <Function> this.queue.shift();
        this.openTabsCount++;
        this.lastTabOpenTime = Date.now();

        // Store the yet to be created tab as a loading tab.
        // We use a queue ID to track it for now since we don't have the tab ID yet.
        const queueId = this.lastQueueId;
        this.lastQueueId++;
        this.loadingQueueIds.push(queueId);

        this.startDrainQueueTimer();
        callback(queueId);
      }
      this.drainingQueue = false;
    }
  }

  /**
   * Starts a timer that triggers `drainQueue()` after `config.tabOpenDelay`.
   */
  startDrainQueueTimer() {
    if (config.tabOpenDelay > 0) {
      setTimeout(() => {
        this.drainQueue();
      }, config.tabOpenDelay);
    }
  }

  /**
   * @returns queueId
   */
  waitForFreeTabSlot(): Promise<QueueId> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.drainQueue();
    });
  }

  // FIXME: Figure out how to extract tab create properties from firefox-webext-browser
  async create(createProperties) {
    const queueId = await this.waitForFreeTabSlot();
    const tab = await browser.tabs.create(createProperties);
    this.queueIdsByTabId[tab.id] = queueId;
    this.tabs.push(tab.id);
    return tab;
  }
}

export const tabCreator = new TabCreator();

/**
 * Waits for a tab with a specific ID to finish loading.
 *
 * If the tab isn't currently loading, it immediately resolves.
 * @param [timeout]
 * The amount of time to wait for a tab to load (in milliseconds). Default value is the one set in
 * config.
 * @throws {TabError} Throws an error if the tab is closed before it loads
 */
export function tabLoaded(
  desiredTabId: number,
  timeout: number = config.tabLoadTimeout,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let removeListeners: Function;
    // FIXME: Figure out how to extract changeInfo type from firefox-webext-browser
    function updatedListener(tabId: number, changeInfo) {
      if (tabId === desiredTabId && changeInfo.status === 'complete') {
        removeListeners();
        resolve();
      }
    }
    function removedListener(tabId: number) {
      if (tabId === desiredTabId) {
        removeListeners();
        reject(
          new TabError(
            `Tab with ID ${tabId} was closed before it could finish loading.`,
            'Closed',
            { tabId },
          ),
        );
      }
    }
    removeListeners = function removeListeners() {
      browser.tabs.onUpdated.removeListener(updatedListener);
      browser.tabs.onRemoved.removeListener(removedListener);
    };

    browser.tabs.onUpdated.addListener(updatedListener);
    browser.tabs.onRemoved.addListener(removedListener);

    const timeoutId = setTimeout(() => {
      removeListeners();
      reject(
        new TabError(`Timed out waiting for tab with ID ${desiredTabId} to load`, 'TimedOut', {
          tabId: desiredTabId,
        }),
      );
    }, timeout);

    const tab = await browser.tabs.get(desiredTabId);
    // Make sure the tab is currently loading
    if (tab.status !== 'loading') {
      clearTimeout(timeoutId);
      removeListeners();
      resolve();
    }
  });
}

/**
 * Creates a new tab.
 * @param url The URL to navigate the tab to initially
 * @param active Whether the tab should become the active tab in the window.
 */
export function createTab(url: string, active: boolean = false) {
  return tabCreator.create({ url, active });
}

/**
 * Closes the tab with the specified ID
 */
export function closeTab(tabId: number) {
  return browser.tabs.remove(tabId);
}

export interface CreateTabPostOptions {
  /** The URL to send a POST request to */
  url: string;
  /** The POST parameters */
  data: object;
  /** Whether the tab should become the active tab in the window */
  active?: boolean;
}
/**
 * Creates a tab with the result of a POST request.
 */
export async function createTabPost({
  url,
  data,
  active = false,
}: CreateTabPostOptions): Promise<browser.tabs.Tab> {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = url;
  form.id = 'zra-helper-post-form';
  for (const key of Object.keys(data)) {
    const input = document.createElement('textarea');
    input.setAttribute('name', key);
    input.textContent = data[key];
    form.appendChild(input);
  }

  let formHtml = form.outerHTML;

  const isFirefox = getCurrentBrowser() === BrowserCode.FIREFOX;

  let tab = null;
  try {
    if (isFirefox) {
      /*
      Firefox doesn't allow executing data URLs from extensions so we need a workaround.
      The current solution is to open a page on the ZRA website, inject a form and then
      submit it. We open manageUpload.htm because it's a nice blank page.
      */
      tab = await createTab('https://www.zra.org.zm/manageUpload.htm', active);
      await tabLoaded(tab.id);
      // Insert the form into the page.
      await runContentScript(tab.id, 'inject_form', { html: formHtml });
    } else {
      formHtml += '<script>document.forms[0].submit();</script>';
      const generatedUrl = `data:text/html;charset=utf8,${encodeURIComponent(formHtml)}`;
      tab = await createTab(generatedUrl, active);
      // wait for form to load
      await tabLoaded(tab.id);
    }
    return tab;
  } catch (error) {
    // If there were any errors but the tab was already opened, make sure it's closed.
    if (tab && tab.id) {
      // TODO: Catch tab close errors
      closeTab(tab.id);
    }
    throw error;
  }
}

/**
 * Promise version of chrome.pageCapture.saveAsMHTML
 */
export function saveAsMHTML(options: chrome.pageCapture.SaveDetails): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (getCurrentBrowser() === BrowserCode.CHROME) {
      chrome.pageCapture.saveAsMHTML(options, (blob: Blob) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(blob);
        }
      });
    } else {
      reject(new Error('Downloading pages as MHTMLs is only supported in chrome.'));
    }
  });
}

/**
 * Gets the active tab in the current window
 */
export async function getActiveTab(): Promise<browser.tabs.Tab | null> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0) {
    return tabs[0];
  }
  return null;
}

/** Whether errors from the ZRA website should be ignored. */
export type IgnoreZraError = boolean;

/**
 * Clicks on an element with the specified selector that is in a tab with the specified ID.
 * @param tabId The ID of the tab on which the element resides.
 * @param selector The selector of the element.
 * @param name A descriptive name of the element used when generating errors.
 * For example, "generate report button".
 */
export async function clickElement(
  tabId: number,
  selector: string,
  name: string = '',
  ignoreZraErrors: IgnoreZraError = false,
) {
  await runContentScript(tabId, 'click_element', {
    selector,
    name,
    ignoreZraErrors,
  });
}

const downloadQueue = new PromiseQueue(
  () => config.maxConcurrentDownloads,
  () => config.downloadDelay,
);

/**
 * Wrapper around `browser.downloads.download()` that supports queuing using the `PromiseQueue`.
 * @returns The download ID.
 */
// FIXME: Extract download options from firefox-webext-browser
export function startDownload(downloadOptions) {
  return downloadQueue.add(() => browser.downloads.download(downloadOptions));
}

/**
 * @param downloadProgress The normalized progress of the download. -1 if progress cannot be determined.
 */
// FIXME: Fix this TSDoc
type MonitorDownloadProgressCallback = (downloadProgress: number) => void;

/**
 * Checks a download's progress every once in a while and passes the progress to the provided
 * callback. Once the download is complete, the promise resolves.
 * @param downloadId The ID of the download whose progress we wish to monitor.
 * @param pollFrequency How frequently to check the download's progress.
 */
export async function monitorDownloadProgress(
  downloadId: number,
  callback: MonitorDownloadProgressCallback,
  pollFrequency: number = 1000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    browser.downloads
      .search({ id: downloadId })
      .then(([item]) => {
        if (item.state === 'complete' || item.state === 'interrupted') {
          if (item.state === 'interrupted') {
            reject(
              new DownloadError(
                `Download with ID ${downloadId} was interrupted: ${item.error}`,
                item.error,
                {
                  downloadItem: item,
                },
              ),
            );
          } else {
            resolve();
          }
        } else {
          let downloadProgress: number;
          if (item.totalBytes > 0) {
            downloadProgress = item.bytesReceived / item.totalBytes;
          } else {
            downloadProgress = -1;
          }
          callback(downloadProgress);

          setTimeout(() => {
            monitorDownloadProgress(downloadId, callback)
              .then(resolve)
              .catch(reject);
          }, pollFrequency);
        }
      })
      .catch(reject);
  });
}

/**
 * Wait's for a download with the specified ID to finish
 * @param id Download ID
 */
export function waitForDownloadToComplete(id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    browser.downloads.onChanged.addListener(async (downloadDelta) => {
      if (downloadDelta.id === id && downloadDelta.state) {
        const state = downloadDelta.state.current;
        if (state === 'complete') {
          resolve();
        }
        if (state === 'interrupted') {
          const [download] = await browser.downloads.search({ id });
          reject(
            new DownloadError(
              `Download with ID ${id} was interrupted: ${download.error}`,
              download.error,
              {
                downloadItem: download,
              },
            ),
          );
        }
      }
    });
  });
}

const requestQueue = new PromiseQueue(() => config.maxConcurrentRequests);

interface RequestOptions {
  url: string;
  /** Type of request */
  method?: 'get' | 'post';
  /** POST request data */
  data?: object;
  responseType?: string;
}

// FIXME: Decide how to type request responses.

/**
 * Makes an HTTP request.
 */
export async function makeRequest<R>({
  url,
  method = 'get',
  data = {},
  responseType = 'text',
}: RequestOptions): Promise<R> {
  const axiosOptions: AxiosRequestConfig = {
    url,
    method,
    responseType,
    timeout: config.requestTimeout,
  };
  if (method === 'get') {
    axiosOptions.params = data;
  } else {
    const params = new URLSearchParams();
    for (const key of Object.keys(data)) {
      params.append(key, data[key]);
    }
    axiosOptions.data = params;
    axiosOptions.headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  }
  const response = await requestQueue.add(() => axios(axiosOptions));
  return response.data;
}

const xmlParser = new xml2js.Parser({ explicitArray: false });

/**
 * Converts an XML string to JSON
 */
async function parseXml<R extends object>(str: string): Promise<R> {
  return new Promise((resolve, reject) => {
    xmlParser.parseString(str, (err: any, result: R) => {
      if (err) {
        reject(err);
      }
      resolve(result);
    });
  });
}

/**
 * Makes a request that returns XML and parses the XML response.
 * @returns The parsed XML.
 */
export async function xmlRequest<R extends object>(options: RequestOptions): Promise<R> {
  const xml: string = await makeRequest(options);
  return parseXml<R>(xml);
}

/**
 * Parses a string of HTML from the ZRA website into a HTML Document.
 * @throws {import('@/errors').ZraError}
 */
export function parseDocument(documentString: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(documentString, 'text/html');
  const zraError = getZraError(doc);
  if (zraError) {
    throw zraError;
  } else {
    return doc;
  }
}

/**
 * Gets a document from the response of an AJAX request.
 * @throws {import('@/backend/errors').ZraError}
 */
export async function getDocumentByAjax(options: RequestOptions): Promise<Document> {
  const data: string = await makeRequest(options);
  return parseDocument(data);
}
