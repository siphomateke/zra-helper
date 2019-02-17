import { deepClone, deepReactiveClone } from '@/utils';

const defaultConfig = {
  debug: {
    /** Whether the app should communicate with devtools. Extension must be reloaded for this to take effect. */
    devtools: false,
    /** Show all user-side logs in the console. */
    logToConsole: false,
    /** Show detailed information about errors if available. */
    errors: false,
    /**
     * Show raw progress bar values such as current value and max value.
     * Additionally keeps progress bars visible even after they are complete.
     */
    progressBars: false,
  },
  /** The amount of time to wait for a tab to load (in milliseconds). */
  tabLoadTimeout: 20000,
  /** The maximum number of tabs that can be opened. Set to 0 to disable. */
  maxOpenTabs: 8,
  /** The time to wait after creating a tab before creating another one (in milliseconds). */
  tabOpenDelay: 0,
  /** The maximum number of times an attempt should be made to login to a client.  */
  maxLoginAttempts: 3,
  actions: {
    getAcknowledgementsOfReturns: {
      /** The maximum number of tabs that can be opened when downloading return receipts. */
      maxOpenTabsWhenDownloading: 3,
    },
    getPaymentHistory: {
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
  },
};

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
