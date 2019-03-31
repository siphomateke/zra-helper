import { deepClone, deepReactiveClone } from '@/utils';
import { Module } from 'vuex';
import { RootState } from '..';

export interface ConfigState {
  debug: {
    /**
     * Whether the app should communicate with devtools. Extension must be reloaded for this to take
     * effect.
     */
    devtools: boolean;
    /** Show all user-side logs in the console. */
    logToConsole: boolean;
    /** Show detailed information about errors if available. */
    errors: boolean;
    /**
     * Show raw progress bar values such as current value and max value.
     * Additionally keeps progress bars visible even after they are complete.
     */
    progressBars: boolean;
    /**
     * Whether these settings should be sent to content scripts.
     * This will be removed if we ever need the config in the content scripts for more than debugging.
     */
    sendConfigToContentScripts: boolean;
    /** Wether to collect extra information about missing elements. */
    missingElementInfo: boolean;
    /**
     * Enable this to remove sensitive client information such as names, usernames and passwords from
     * exports.
     */
    anonymizeClientsInExports: boolean;
  };
  /** The amount of time to wait for a tab to load (in milliseconds). */
  tabLoadTimeout: number;
  /** The amount of time to wait for HTTP requests to complete (in milliseconds). Set to 0 to disable. */
  requestTimeout: number;
  /** The maximum number of tabs that can be opened. Set to 0 to disable. */
  maxOpenTabs: number;
  /** The time to wait after creating a tab before creating another one (in milliseconds). */
  tabOpenDelay: number;
  /** The maximum number of times an attempt should be made to login to a client. */
  maxLoginAttempts: number;
  /** Whether to send a notification when all running tasks have completed. */
  sendNotifications: boolean;
  /**
   * Whether to show a prompt to retry actions that encountered errors when all running tasks have
   * completed.
   */
  promptRetryActions: boolean;
  /**
   * If enabled, when running actions, the ZRA website will be stripped down to the bare minimum to
   * increase performance. This means that while the extension is running, the ZRA website may not
   * be usable.
   */
  zraLiteMode: boolean;
  actions: {
    getAcknowledgementsOfReturns: {
      /** The maximum number of tabs that can be opened when downloading return receipts. */
      maxOpenTabsWhenDownloading: number;
    };
    getPaymentReceipts: {
      /** The maximum number of tabs that can be opened when downloading payment receipts. */
      maxOpenTabsWhenDownloading: number;
    };
  };
  log: {
    showDateInTimestamp: boolean;
  };
  export: {
    /**
     * Whether 'save as' dialogs should be shown when exporting various things in formats such as CSV
     * and JSON.
     */
    showSaveAsDialog: boolean;
    /**
     * Removes the .mhtml file extension from all downloaded receipts.
     * Enable this to stop Chrome on Windows from warning that every downloaded receipt is dangerous.
     */
    removeMhtmlExtension: boolean;
  };
}

const defaultConfig: ConfigState = {
  debug: {
    devtools: false,
    logToConsole: false,
    errors: true,
    progressBars: false,
    sendConfigToContentScripts: true,
    missingElementInfo: true,
    anonymizeClientsInExports: true,
  },
  tabLoadTimeout: 20000,
  requestTimeout: 10000,
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

const module: Module<ConfigState, RootState> = {
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
