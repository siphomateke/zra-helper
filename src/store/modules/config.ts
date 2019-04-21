import { deepClone, deepReactiveClone, deepAssign } from '@/utils';
import { Module } from 'vuex';
import { RootState } from '@/store/types';

export type EolConfig = 'auto' | 'CRLF' | 'LF';

export interface ConfigState {
  debug: {
    /**
     * Whether the app should communicate with devtools. Extension must be reloaded for this to take
     * effect.
     */
    devtools: boolean;
    /** Show all user-side logs in the console. */
    logToConsole: boolean;
    /** Whether to log task errors in the console for easier debugging. */
    showTaskErrorsInConsole: boolean;
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
    /**
     * Tracks how long tasks take and displays the information in their titles. Must be enabled before
     * running the tasks.
     */
    calculateTaskDuration: boolean;
  };
  /** The amount of time to wait for a tab to load (in milliseconds). */
  tabLoadTimeout: number;
  /** The amount of time to wait for HTTP requests to complete (in milliseconds). Set to 0 to disable. */
  requestTimeout: number;
  /** The maximum number of HTTP requests that can be running at once. Set to 0 to disable. */
  maxConcurrentRequests: number;
  /** The maximum number of tabs that can be opened. Set to 0 to disable. */
  maxOpenTabs: number;
  /**
   * The maximum number of tabs that can be opened when downloading pages one after another. Set to 0
   * to disable.
   */
  maxOpenTabsWhenDownloading: number;
  /** The maximum number of tabs that can be loading at once. Set to 0 to disable. */
  maxLoadingTabs: number;
  /** The time to wait after creating a tab before creating another one (in milliseconds). */
  tabOpenDelay: number;
  /** The maximum number of times an attempt should be made to login to a client. */
  maxLoginAttempts: number;
  /** The maximum number of downloads that can be downloading at the same time. Set to 0 to disable. */
  maxConcurrentDownloads: number;
  /** Time time to wait after starting a download before starting another (in milliseconds). */
  downloadDelay: number;
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
  /** Action options stored by action ID. */
  // FIXME: Document and type action options properly.
  actions: { [key: string]: object };
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
    /** File type to use when downloading pages such as receipts. */
    pageDownloadFileType: 'mhtml' | 'html';
    /**
     * Makes the page title of downloaded HTML files the same as their filenames. This is useful when
     * re-saving HTML files as PDFs in Chrome since it uses page titles as filenames.
     */
    useFilenameAsHtmlPageTitle: boolean;
    /**
     * The default end of line character. If set to 'auto', the end of line character will be
     * automatically determined based on the operating system.
     */
    eol: EolConfig;
    /** Whether to include task duration in exports. */
    taskDuration: boolean;
  };
  /** Tracks which warnings that have been dismissed by the user and shouldn't be shown again. */
  dismissed: {
    /**
     * Whether the warning about the task viewer interfering with tasks in the dashboard has been
     * dismissed.
     */
    taskViewerWarning: boolean;
    checkApprovalStatusAction: {
      /** Warning about checking acknowledgement of returns receipts being slow. */
      ackReceiptsPerformanceWarning: boolean;
    },
  },
}

const defaultConfig: ConfigState = {
  debug: {
    devtools: false,
    logToConsole: false,
    showTaskErrorsInConsole: false,
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
  maxLoadingTabs: 0,
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
    useFilenameAsHtmlPageTitle: true,
    eol: 'auto',
    taskDuration: false,
  },
  dismissed: {
    taskViewerWarning: false,
    checkApprovalStatusAction: {
      ackReceiptsPerformanceWarning: false,
    },
  },
};

// TODO: Use TypeScript
const vuexModule: Module<ConfigState, RootState> = {
  namespaced: true,
  state: deepClone(defaultConfig),
  mutations: {
    // TODO: Allow changing nested config properties
    setProp<K extends keyof ConfigState>(
      state: ConfigState,
      { prop, value }: { prop: K; value: ConfigState[K] },
    ) {
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
    async load({ commit, dispatch }) {
      commit('setConfigLoadingState', true, { root: true });
      try {
        const items = await browser.storage.sync.get('config');
        if ('config' in items) {
          const config: ConfigState = deepAssign(defaultConfig, items.config);
          await dispatch('set', config);
          await dispatch('updateConfig');
        } else {
          // If no config exists, save the default one.
          await dispatch('save');
        }
      } finally {
        commit('setConfigLoadingState', false, { root: true });
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
