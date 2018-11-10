export default {
  debug: false,
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
  returnHistory: {
    /** The maximum number of tabs that can be opened when downloading return receipts. */
    maxOpenTabsWhenDownloading: 3,
  },
  paymentHistory: {
    /** The maximum number of tabs that can be opened when downloading payment receipts. */
    maxOpenTabsWhenDownloading: 3,
  },
  /**
   * The time to wait after creating a tab before creating another one (in milliseconds).
   * @type {number}
   */
  tabOpenDelay: 0,
};
