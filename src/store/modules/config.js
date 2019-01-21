/** @type {import('vuex').Module} */
const module = {
  state: {
    debug: {
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
    /**
     * The amount of time to wait for a tab to load (in milliseconds).
     * @type {number}
     */
    tabLoadTimeout: 20000,
    /**
     * The maximum number of tabs that can be opened. Set to 0 to disable.
     * @type {number}
     */
    maxOpenTabs: 8,
    /**
     * The time to wait after creating a tab before creating another one (in milliseconds).
     * @type {number}
     */
    tabOpenDelay: 0,
    actions: {
      getAllReturns: {
        /** The maximum number of tabs that can be opened when downloading return receipts. */
        maxOpenTabsWhenDownloading: 3,
      },
      getPaymentHistory: {
        /** The maximum number of tabs that can be opened when downloading payment receipts. */
        maxOpenTabsWhenDownloading: 3,
      },
    },
  },
  mutations: {
    setDebugMode(state, mode) {
      state.debug = mode;
    },
  },
};
export default module;
