import { deepClone, deepReactiveClone, deepAssign } from '@/utils';

/**
 * @typedef {'auto'|'CRLF'|'LF'} EolConfig
 */

/**
 * @typedef {Object} State
 *
 * @property {Object} debug
 * @property {boolean} debug.devtools
 * Whether the app should communicate with devtools. Extension must be reloaded for this to take
 * effect.
 * @property {boolean} debug.logToConsole
 * Show all user-side logs in the console.
 * @property {boolean} debug.errors
 * Show detailed information about errors if available.
 * @property {boolean} debug.progressBars
 * Show raw progress bar values such as current value and max value.
 * Additionally keeps progress bars visible even after they are complete.
 * @property {boolean} debug.sendConfigToContentScripts
 * Whether these settings should be sent to content scripts.
 * This will be removed if we ever need the config in the content scripts for more than debugging.
 * @property {boolean} debug.missingElementInfo
 * Wether to collect extra information about missing elements.
 * @property {boolean} debug.anonymizeClientsInExports
 * Enable this to remove sensitive client information such as names, usernames and passwords from
 * exports.
 * @property {boolean} debug.calculateTaskDuration
 * Tracks how long tasks take and displays the information in their titles. Must be enabled before
 * running the tasks.
 *
 * @property {number} tabLoadTimeout
 * The amount of time to wait for a tab to load (in milliseconds).
 * @property {number} requestTimeout
 * The amount of time to wait for HTTP requests to complete (in milliseconds). Set to 0 to disable.
 * @property {number} maxConcurrentRequests
 * The maximum number of HTTP requests that can be running at once. Set to 0 to disable.
 * @property {number} maxOpenTabs
 * The maximum number of tabs that can be opened. Set to 0 to disable.
 * @property {number} maxOpenTabsWhenDownloading
 * The maximum number of tabs that can be opened when downloading pages one after another. Set to 0
 * to disable.
 * @property {number} tabOpenDelay
 * The time to wait after creating a tab before creating another one (in milliseconds).
 * @property {number} maxLoginAttempts
 * The maximum number of times an attempt should be made to login to a client.
 * @property {number} maxConcurrentDownloads
 * The maximum number of downloads that can be downloading at the same time. Set to 0 to disable.
 * @property {number} downloadDelay
 * Time time to wait after starting a download before starting another (in milliseconds).
 * @property {boolean} sendNotifications
 * Whether to send a notification when all running tasks have completed.
 * @property {boolean} promptRetryActions
 * Whether to show a prompt to retry actions that encountered errors when all running tasks have
 * completed.
 * @property {boolean} zraLiteMode
 * If enabled, when running actions, the ZRA website will be stripped down to the bare minimum to
 * increase performance. This means that while the extension is running, the ZRA website may not
 * be usable.
 *
 * @property {Object} actions Action options stored by action ID.
 *
 * @property {Object} log
 * @property {boolean} log.showDateInTimestamp
 *
 * @property {Object} export
 * @property {boolean} export.showSaveAsDialog
 * Whether 'save as' dialogs should be shown when exporting various things in formats such as CSV
 * and JSON.
 * @property {boolean} export.removeMhtmlExtension
 * Removes the .mhtml file extension from all downloaded receipts.
 * Enable this to stop Chrome on Windows from warning that every downloaded receipt is dangerous.
 * @property {'mhtml'|'html'} export.pageDownloadFileType
 * File type to use when downloading pages such as receipts.
 * @property {EolConfig} export.eol
 * The default end of line character. If set to 'auto', the end of line character will be
 * automatically determined based on the operating system.
 * @property {boolean} export.taskDuration
 * Whether to include task duration in exports.
 */

/** @type {State} */
const defaultConfig = {
  debug: {
    devtools: false,
    logToConsole: false,
    errors: true,
    progressBars: false,
    sendConfigToContentScripts: true,
    missingElementInfo: true,
    anonymizeClientsInExports: false,
    calculateTaskDuration: false,
  },
  tabLoadTimeout: 20000,
  requestTimeout: 20000,
  maxConcurrentRequests: 200,
  maxOpenTabs: 8,
  maxOpenTabsWhenDownloading: 3,
  tabOpenDelay: 0,
  maxLoginAttempts: 3,
  maxConcurrentDownloads: 0,
  downloadDelay: 0,
  sendNotifications: true,
  promptRetryActions: true,
  zraLiteMode: true,
  actions: {},
  log: {
    showDateInTimestamp: true,
  },
  export: {
    showSaveAsDialog: true,
    removeMhtmlExtension: true,
    pageDownloadFileType: 'html',
    eol: 'auto',
    taskDuration: false,
  },
};

/** @type {import('vuex').Module<State>} */
const vuexModule = {
  namespaced: true,
  state: deepClone(defaultConfig),
  mutations: {
    setProp(state, { prop, value }) {
      state[prop] = value;
    },
    set(state, value) {
      deepReactiveClone(value, state);
    },
  },
  actions: {
    set({ commit }, value) {
      commit('set', value);
    },
    async resetToDefaults({ dispatch }) {
      await dispatch('set', defaultConfig);
    },
    async load({ dispatch }) {
      const items = await browser.storage.sync.get('config');
      if ('config' in items) {
        /** @type {State} */
        const config = deepAssign(defaultConfig, items.config);
        await dispatch('set', config);
        await dispatch('updateConfig');
      } else {
        // If no config exists, save the default one.
        await dispatch('save');
      }
    },
    async save({ state, dispatch }) {
      await browser.storage.sync.set({ config: state });
      await dispatch('updateConfig');
    },
    async updateConfig({ dispatch }) {
      await dispatch('updateEolCharacter', null, { root: true });
    },
  },
};
export default vuexModule;
