import { deepClone, deepReactiveClone } from '@/utils';

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

 * @property {number} tabLoadTimeout
 * The amount of time to wait for a tab to load (in milliseconds).
 * @property {number} maxOpenTabs
 * The maximum number of tabs that can be opened. Set to 0 to disable.
 * @property {number} tabOpenDelay
 * The time to wait after creating a tab before creating another one (in milliseconds).
 * @property {number} maxLoginAttempts
 * The maximum number of times an attempt should be made to login to a client.
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
 * @property {Object} actions
 * @property {Object} actions.getAcknowledgementsOfReturns
 * @property {number} actions.getAcknowledgementsOfReturns.maxOpenTabsWhenDownloading
 * The maximum number of tabs that can be opened when downloading return receipts.
 * @property {Object} actions.getPaymentReceipts
 * @property {number} actions.getPaymentReceipts.maxOpenTabsWhenDownloading
 * The maximum number of tabs that can be opened when downloading payment receipts.
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
  },
  tabLoadTimeout: 20000,
  maxOpenTabs: 8,
  tabOpenDelay: 0,
  maxLoginAttempts: 3,
  sendNotifications: true,
  promptRetryActions: true,
  zraLiteMode: true,
  actions: {
    getAcknowledgementsOfReturns: {
      maxOpenTabsWhenDownloading: 3,
    },
    getPaymentReceipts: {
      maxOpenTabsWhenDownloading: 3,
    },
  },
  log: {
    showDateInTimestamp: true,
  },
  export: {
    showSaveAsDialog: true,
    removeMhtmlExtension: true,
  },
};

/** @type {import('vuex').Module<State>} */
const module = {
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
        await dispatch('set', items.config);
      }
    },
    async save({ state }) {
      await browser.storage.sync.set({ config: state });
    },
  },
};
export default module;
