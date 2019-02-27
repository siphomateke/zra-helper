import { deepClone, deepReactiveClone } from '@/utils';

/* eslint-disable max-len */
const defaultConfig = {
  debug: {
    /** Whether the app should communicate with devtools. Extension must be reloaded for this to take effect. */
    devtools: false,
    /** Show all user-side logs in the console. */
    logToConsole: false,
    /** Show detailed information about errors if available. */
    errors: true,
    /**
     * Show raw progress bar values such as current value and max value.
     * Additionally keeps progress bars visible even after they are complete.
     */
    progressBars: false,
    /**
     * Whether these settings should be sent to content scripts.
     * This will be removed if we ever need the config in the content scripts for more than debugging.
     */
    sendConfigToContentScripts: true,
    /** Wether to collect extra information about missing elements. */
    missingElementInfo: true,
  },
  /** The amount of time to wait for a tab to load (in milliseconds). */
  tabLoadTimeout: 20000,
  /** The maximum number of tabs that can be opened. Set to 0 to disable. */
  maxOpenTabs: 8,
  /** The time to wait after creating a tab before creating another one (in milliseconds). */
  tabOpenDelay: 0,
  /** The maximum number of times an attempt should be made to login to a client.  */
  maxLoginAttempts: 3,
  /** Whether to send a notification when all running tasks have completed. */
  sendNotifications: true,
  actions: {
    getAcknowledgementsOfReturns: {
      /** The maximum number of tabs that can be opened when downloading return receipts. */
      maxOpenTabsWhenDownloading: 3,
    },
    getPaymentReceipts: {
      /** The maximum number of tabs that can be opened when downloading payment receipts. */
      maxOpenTabsWhenDownloading: 3,
    },
  },
  log: {
    showDateInTimestamp: true,
  },
  export: {
    /** Whether 'save as' dialogs should be shown when exporting various things in formats such as CSV and JSON. */
    showSaveAsDialog: true,
    /**
     * Removes the .mhtml file extension from all downloaded receipts.
     * Enable this to stop Chrome on Windows from warning that every downloaded receipt is dangerous.
     */
    removeMhtmlExtension: true,
  },
};
/* eslint-enable max-len */

/** @type {import('vuex').Module} */
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
