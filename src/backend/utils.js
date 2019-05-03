import axios from 'axios';
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
import { browserCodes } from './constants';

/**
 * Waits for a specific message.
 *
 * @param {function} validator Function that checks if a message is the one we are waiting for
 */
export function waitForMessage(validator) {
  return new Promise(async (resolve) => {
    function listener(message) {
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
 *
 * @param {number} tabId
 * @param {any} message
 * @throws {SendMessageError}
 */
export async function sendMessage(tabId, message) {
  let response;
  try {
    response = await browser.tabs.sendMessage(tabId, message);
  } catch (error) {
    const errorString = error.message ? error.message : error.toString();
    throw new SendMessageError(`Failed to send message to tab with ID ${tabId}: "${errorString}"`);
  }
  if (response.error) {
    throw errorFromJson(response.error);
  }
  return response;
}

/**
 * Executes a script in a particular tab
 *
 * @param {number} tabId
 * @param {string} filename The name of the script to execute excluding the extension.
 * @param {boolean} vendor
 * @throws {ExecuteScriptError}
 */
export async function executeScript(tabId, filename, vendor = false) {
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
 * @param {number} tabId
 * @param {string} id
 * A string that is both the filename of the script and the command that will be sent to trigger
 * the script.
 * @param {Object} message Message that will be sent to the script.
 */
export async function runContentScript(tabId, id, message = {}) {
  await executeScript(tabId, id);
  const response = await sendMessage(tabId, {
    command: id,
    ...message,
  });
  return response;
}

class TabCreator {
  constructor() {
    /**
     * Array of IDs of tabs created by the extension which are currently open.
     * @type {number[]}
     */
    this.tabs = [];
    /** The number of tabs that are currently open. */
    this.openTabsCount = 0;
    this.lastTabOpenTime = null;
    this.queue = [];
    this.drainingQueue = false;

    browser.tabs.onRemoved.addListener((tabId) => {
      if (this.tabs.includes(tabId)) {
        this.openTabsCount--;
        this.tabs.splice(this.tabs.indexOf(tabId), 1);
        this.drainQueue();
      }
    });
  }

  /**
   * Checks if a tab can be opened.
   * @returns {boolean}
   */
  slotFree() {
    const notMaxOpenTabs = config.maxOpenTabs === 0 || this.openTabsCount < config.maxOpenTabs;
    const timeSinceLastTabOpened = Date.now() - this.lastTabOpenTime;
    const delayLargeEnough = (
      this.lastTabOpenTime === null
      || timeSinceLastTabOpened >= config.tabOpenDelay
    );
    return notMaxOpenTabs && delayLargeEnough;
  }

  /**
   * Loops through pending tabs and checks if they can be created.
   */
  drainQueue() {
    if (!this.drainingQueue) {
      this.drainingQueue = true;
      while (this.queue.length > 0 && this.slotFree()) {
        const callback = this.queue.shift();
        this.openTabsCount++;
        this.lastTabOpenTime = Date.now();
        this.startDrainQueueTimer();
        callback();
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

  waitForFreeTabSlot() {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.drainQueue();
    });
  }

  async create(createProperties) {
    await this.waitForFreeTabSlot();
    const tab = await browser.tabs.create(createProperties);
    this.tabs.push(tab.id);
    return tab;
  }
}

export const tabCreator = new TabCreator();

/**
 * Waits for a tab with a specific ID to finish loading.
 *
 * If the tab isn't currently loading, it immediately resolves.
 * @param {number} desiredTabId
 * @param {number} [timeout]
 * The amount of time to wait for a tab to load (in milliseconds). Default value is the one set in
 * config.
 * @returns {Promise}
 * @throws {TabError} Throws an error if the tab is closed before it loads
 */
export function tabLoaded(desiredTabId, timeout = null) {
  if (timeout === null) timeout = config.tabLoadTimeout;

  return new Promise(async (resolve, reject) => {
    const tab = await browser.tabs.get(desiredTabId);
    // Make sure the tab is currently loading
    if (tab.status !== 'loading') {
      resolve();
      return;
    }

    let removeListeners;
    function updatedListener(tabId, changeInfo) {
      if (tabId === desiredTabId && changeInfo.status === 'complete') {
        removeListeners();
        resolve();
      }
    }
    function removedListener(tabId) {
      if (tabId === desiredTabId) {
        removeListeners();
        reject(new TabError(
          `Tab with ID ${tabId} was closed before it could finish loading.`,
          'Closed',
          { tabId },
        ));
      }
    }
    removeListeners = function removeListeners() {
      browser.tabs.onUpdated.removeListener(updatedListener);
      browser.tabs.onRemoved.removeListener(removedListener);
    };

    browser.tabs.onUpdated.addListener(updatedListener);
    browser.tabs.onRemoved.addListener(removedListener);

    setTimeout(() => {
      removeListeners();
      reject(new TabError(`Timed out waiting for tab with ID ${desiredTabId} to load`, 'TimedOut', {
        tabId: desiredTabId,
      }));
    }, timeout);
  });
}

/**
 * Creates a new tab.
 * @param {string} url The URL to navigate the tab to initially
 * @param {boolean} active Whether the tab should become the active tab in the window.
 */
export function createTab(url, active = false) {
  return tabCreator.create({ url, active });
}

/**
 * Closes the tab with the specified ID
 * @param {number} tabId
 */
export function closeTab(tabId) {
  return browser.tabs.remove(tabId);
}

/**
 * @typedef CreateTabPostOptions
 * @property {string} url The URL to send a POST request to
 * @property {Object} data The POST parameters
 * @property {boolean} [active=false] Whether the tab should become the active tab in the window
 */

/**
 * Creates a tab with the result of a POST request.
 * @param {CreateTabPostOptions} options
 */
export async function createTabPost({ url, data, active = false }) {
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

  const isFirefox = getCurrentBrowser() === browserCodes.FIREFOX;

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
 * @param {Object} options
 */
export function saveAsMHTML(options) {
  return new Promise((resolve, reject) => {
    if (getCurrentBrowser() === browserCodes.CHROME) {
      chrome.pageCapture.saveAsMHTML(options, (blob) => {
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
 *
 * @returns {Promise.<browser.tabs.Tab>}
 */
export async function getActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0) {
    return tabs[0];
  }
  return null;
}

/**
 * @typedef {boolean} IgnoreZraError
 * Whether errors from the ZRA website should be ignored.
 */

/**
 * Clicks on an element with the specified selector that is in a tab with the specified ID.
 * @param {number} tabId The ID of the tab on which the element resides.
 * @param {string} selector The selector of the element.
 * @param {string} name A descriptive name of the element used when generating errors.
 * For example, "generate report button".
 * @param {IgnoreZraError} [ignoreZraErrors=false]
 */
export async function clickElement(tabId, selector, name = null, ignoreZraErrors = false) {
  await runContentScript(tabId, 'click_element', {
    selector,
    name,
    ignoreZraErrors,
  });
}

/**
 * @callback monitorDownloadProgressCallback
 * @param {number} downloadProgress
 * The normalized progress of the download. -1 if progress cannot be determined.
 */

/**
 * Checks a download's progress every once in a while and passes the progress to the provided
 * callback. Once the download is complete, the promise resolves.
 * @param {number} downloadId The ID of the download whose progress we wish to monitor.
 * @param {monitorDownloadProgressCallback} callback
 * @param {number} pollFrequency How frequently to check the download's progress.
 */
export async function monitorDownloadProgress(downloadId, callback, pollFrequency = 1000) {
  return new Promise((resolve, reject) => {
    browser.downloads.search({ id: downloadId }).then(([item]) => {
      if (item.state === 'complete' || item.state === 'interrupted') {
        if (item.state === 'interrupted') {
          reject(new DownloadError(`Download with ID ${downloadId} was interrupted: ${item.error}`, item.error, {
            downloadItem: item,
          }));
        } else {
          resolve();
        }
      } else {
        let downloadProgress = null;
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
    }).catch(reject);
  });
}

/**
 * Wait's for a download with the specified ID to finish
 * @param {number} id Download ID
 */
export function waitForDownloadToComplete(id) {
  return new Promise((resolve, reject) => {
    browser.downloads.onChanged.addListener(async (downloadDelta) => {
      if (downloadDelta.id === id && downloadDelta.state) {
        const state = downloadDelta.state.current;
        if (state === 'complete') {
          resolve();
        }
        if (state === 'interrupted') {
          const [download] = await browser.downloads.search({ id });
          reject(new DownloadError(`Download with ID ${id} was interrupted: ${download.error}`, download.error, {
            downloadItem: download,
          }));
        }
      }
    });
  });
}

/**
 * @typedef {Object} RequestOptions
 * @property {string} url
 * @property {string} [method=get] Type of request
 * @property {Object} [data] POST request data
 */

/**
 * Makes an HTTP request.
 * @param {RequestOptions} options
 * @returns {Promise.<*>}
 */
export async function makeRequest({ url, method = 'get', data = {} }) {
  /** @type {import('axios').AxiosRequestConfig} */
  const axiosOptions = {
    url,
    method,
    responseType: 'text',
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
    axiosOptions.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  }
  const response = await axios(axiosOptions);
  return response.data;
}

const xmlParser = new xml2js.Parser({ explicitArray: false });

/**
 * Converts an XML string to JSON
 * @param {string} str
 * @returns {Promise<Object>}
 */
async function parseXml(str) {
  return new Promise((resolve, reject) => {
    xmlParser.parseString(str, (err, result) => {
      if (err) {
        reject(err);
      }
      resolve(result);
    });
  });
}

/**
 * Makes a request that returns XML and parses the XML response.
 * @param {RequestOptions} options
 * @returns {Promise.<Object>} The parsed XML.
 */
export async function xmlRequest(options) {
  const xml = await makeRequest(options);
  return parseXml(xml);
}

/**
 * Parses a string of HTML from the ZRA website into a HTML Document.
 * @param {string} documentString
 * @returns {Document}
 * @throws {import('@/errors').ZraError}
 */
export function parseDocument(documentString) {
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
 * @param {RequestOptions} options
 * @returns {Promise.<Document>}
 * @throws {import('@/backend/errors').ZraError}
 */
export async function getDocumentByAjax(options) {
  const data = await makeRequest(options);
  return parseDocument(data);
}
