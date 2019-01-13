import browser from 'webextension-polyfill';
import axios from 'axios';
import { errorFromJson, TabError, ExecuteScriptError, SendMessageError } from '@/backend/errors';
import { getZraError } from '@/backend/content_scripts/helpers/zra';

class TabCreator {
  constructor() {
    this.config = null;
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
        this.openTabsCount -= 1;
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
    const notMaxOpenTabs = this.config.maxOpenTabs === 0 || this.openTabsCount < this.config.maxOpenTabs;
    const timeSinceLastTabOpened = Date.now() - this.lastTabOpenTime;
    const delayLargeEnough = this.lastTabOpenTime === null || timeSinceLastTabOpened >= this.config.tabOpenDelay;
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
   * Starts a timer that triggers `drainQueue()` after `this.config.tabOpenDelay`.
   */
  startDrainQueueTimer() {
    if (this.config.tabOpenDelay > 0) {
      setTimeout(() => {
        this.drainQueue();
      }, this.config.tabOpenDelay);
    }
  }

  waitForFreeTabSlot() {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.drainQueue();
    });
  }

  async create(config, createProperties) {
    this.config = config;
    await this.waitForFreeTabSlot();
    const tab = await browser.tabs.create(createProperties);
    this.tabs.push(tab.id);
    return tab;
  }
}

export const tabCreator = new TabCreator();

/** @typedef {import('vuex').ActionContext} ActionContext */

export default {
  namespaced: true,
  actions: {
    /**
     * Creates a new tab.
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {string} payload.url The URL to navigate the tab to initially
     * @param {*} payload.active Whether the tab should become the active tab in the window.
     */
    createTab({ rootState }, { url, active = false }) {
      return tabCreator.create(rootState.config, { url, active });
    },

    /**
     * @typedef CreateTabPostOptions
     * @property {string} url The URL to send a POST request to
     * @property {Object} data The POST parameters
     * @property {boolean} [active=false] Whether the tab should become the active tab in the window
     */

    /**
     * Creates a tab with the result of a POST request.
     * @param {ActionContext} context
     * @param {CreateTabPostOptions} payload
     */
    async createTabPost({ dispatch }, { url, data, active = false }) {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = url;
      for (const key of Object.keys(data)) {
        const input = document.createElement('textarea');
        input.setAttribute('name', key);
        input.textContent = data[key];
        form.appendChild(input);
      }

      let generatedUrl = 'data:text/html;charset=utf8,';
      generatedUrl += encodeURIComponent(form.outerHTML);
      generatedUrl += encodeURIComponent('<script>document.forms[0].submit();</script>');

      const tab = await dispatch('createTab', { url: generatedUrl, active });
      // wait for form to load
      await dispatch('tabLoaded', { desiredTabId: tab.id });
      return tab;
    },

    /**
     * Promise version of chrome.pageCapture.saveAsMHTML
     * @param {ActionContext} context
     * @param {Object} options
     */
    saveAsMHTML(context, options) {
      return new Promise((resolve, reject) => {
        // FIXME: Handle browser not being Chrome
        chrome.pageCapture.saveAsMHTML(options, (blob) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(blob);
          }
        });
      });
    },

    /**
     * Executes a script in a particular tab
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {number} payload.tabId
     * @param {browser.extensionTypes.InjectDetails} payload.details
     * @param {boolean} payload.vendor
     * @throws {ExecuteScriptError}
     */
    async executeScript(context, { tabId, details, vendor = false }) {
      if (details.file) {
        if (!vendor) {
          details.file = `content_scripts/${details.file}`;
        } else {
          details.file = `vendor/${details.file}`;
        }
      }
      try {
        await browser.tabs.executeScript(tabId, details);
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
    },

    /**
     * Closes the tab with the specified ID
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {number} payload.tabId
     */
    // TODO: Make sure this is used
    closeTab(context, { tabId }) {
      return browser.tabs.remove(tabId);
    },

    /**
     * Waits for a tab with a specific ID to load
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {number} payload.desiredTabId
     * @param {number} [payload.timeout]
     * The amount of time to wait for a tab to load (in milliseconds). Default value is the one set in config.
     * @returns {Promise}
     * @throws {TabError} Throws an error if the tab is closed before it loads
     */
    tabLoaded({ rootState }, { desiredTabId, timeout = null }) {
      if (timeout === null) timeout = rootState.config.tabLoadTimeout;

      return new Promise((resolve, reject) => {
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
    },

    /**
     * Gets the active tab in the current window
     * @returns {Promise.<browser.tabs.Tab>}
     */
    async getActiveTab() {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0) {
        return tabs[0];
      }
      return null;
    },

    /**
     * Waits for a specific message.
     * @param {ActionContext} context
     * @param {function} validator Function that checks if a message is the one we are waiting for
     */
    waitForMessage(context, validator) {
      return new Promise(async (resolve) => {
        function listener(message) {
          if (validator(message)) {
            browser.runtime.onMessage.removeListener(listener);
            resolve(message);
          }
        }
        browser.runtime.onMessage.addListener(listener);
      });
    },

    /**
     * Sends a single message to the content script(s) in the specified tab.
     * Also throws any errors received as messages.
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {number} payload.tabId
     * @param {any} payload.message
     * @throws {SendMessageError}
     */
    async sendMessage(context, { tabId, message }) {
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
    },

    /**
     * Clicks on an element with the specified selector that is in a tab with the specified ID.
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {number} payload.tabId The ID of the tab on which the element resides.
     * @param {string} payload.selector The selector of the element.
     * @param {string} payload.name A descriptive name of the element used when generating errors.
     * For example, "generate report button".
     * @param {boolean} payload.ignoreZraErrors Set to true to not throw errors when ZRA errors are detected.
     */
    async clickElement({ dispatch }, {
      tabId, selector, name = null, ignoreZraErrors = false,
    }) {
      await dispatch('executeScript', { tabId, details: { file: 'click_element.js' } });
      await dispatch('sendMessage', {
        tabId,
        message: {
          command: 'click',
          selector,
          name,
          ignoreZraErrors,
        },
      });
    },

    /**
     * Wait's for a download with the specified ID to finish
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {number} payload.id Download ID
     */
    waitForDownloadToComplete(context, { id }) {
      return new Promise((resolve, reject) => {
        browser.downloads.onChanged.addListener(async (downloadDelta) => {
          if (downloadDelta.id === id && downloadDelta.state) {
            const state = downloadDelta.state.current;
            if (state === 'complete') {
              resolve();
            }
            if (state === 'interrupted') {
              const downloads = await browser.downloads.search({ id });
              // TODO: Handle download errors better
              reject(downloads[0].error);
            }
          }
        });
      });
    },

    /**
     * Gets a document from the response of an AJAX request.
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {string} payload.url
     * @param {string} [payload.method=get] Type of request
     * @param {Object} [payload.data] POST request data
     * @returns {Promise.<Document>}
     */
    async getDocumentByAjax(context, { url, method = 'get', data = {} }) {
      /** @type {import('axios').AxiosRequestConfig} */
      const axiosOptions = {
        url,
        method,
        responseType: 'text',
      };
      if (method === 'get') {
        axiosOptions.params = data;
      } else {
        const formData = new FormData();
        for (const key of Object.keys(data)) {
          formData.set(key, data[key]);
        }
        axiosOptions.data = formData;
        axiosOptions.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      }
      const response = await axios(axiosOptions);
      const parser = new DOMParser();
      const doc = parser.parseFromString(response.data, 'text/html');
      const zraError = getZraError(doc);
      if (zraError) {
        throw zraError;
      } else {
        return doc;
      }
    },
  },
};
