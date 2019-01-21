/** @type {import('vuex').Module} */
const module = {
  state: {
    debug: {
      /** Show all user-side logs in the console. */
      logToConsole: false,
      /** Show detailed information about errors if available. */
      errors: false,
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
  },
  mutations: {
    setDebugMode(state, mode) {
      state.debug = mode;
    },
  },
};
export default module;
