import { exportFormatCodes } from '@/backend/constants';
import { objectHasProperties, joinSpecialLast } from '@/utils';
import { ExtendedError, errorToString } from '../errors';
import store from '@/store';
import { taskStates } from '@/store/modules/tasks';
import { has, get } from 'dot-prop';

/**
 * @typedef {import('@/backend/constants').Client} Client
 * @typedef {import('../constants').ExportFormatCode} ExportFormatCode
 * @typedef {import('@/transitional/tasks').TaskObject} TaskObject
 */

/**
 * @typedef {import('@/store/modules/client_actions').ClientActionOutputs} ClientActionOutputs
 *
 * @typedef {Object} ClientActionOutputFormatterOptions
 * @property {Client[]} clients
 * @property {Client[]} allClients
 * @property {ClientActionOutputs} outputs
 * @property {ExportFormatCode} format
 * @property {boolean} anonymizeClients Whether client data in the output should be anonymized.
 *
 * @callback ClientActionOutputFormatter
 * @param {ClientActionOutputFormatterOptions} options
 * @returns {string}
 */

/**
 * @typedef ClientActionOptions
 * @property {string} id A unique camelCase ID to identify this client action.
 * @property {string} name The human-readable name of this client action.
 * @property {new () => ClientActionRunner} [Runner]
 * @property {() => Object} [defaultInput]
 * @property {import('@/backend/constants').BrowserFeature[]} [requiredFeatures]
 * Features this action requires that are only available in certain browsers.
 * @property {boolean} [usesLoggedInTab]
 * Whether this action needs to open a page from a logged in tab.
 * If this is enabled, the page that is opened after logging in will not be closed until the user is
 * about to be logged out.
 * @property {boolean} [requiresTaxTypes]
 * @property {boolean} [hasOutput] Whether this client action returns an output.
 * @property {ExportFormatCode} [defaultOutputFormat]
 * Default output format. Must be set if `hasOutput` is set.
 * @property {ExportFormatCode[]} [outputFormats]
 * The export formats this client action can output. Must be set if `hasOutput` is set.
 * @property {ClientActionOutputFormatter} [outputFormatter]
 * Function that formats the output into different formats such as CSV and JSON.
 *
 * @typedef {Object} ClientActionObject_Temp
 * @property {string} logCategory The log category to use when logging anything in this action.
 *
 * @typedef {ClientActionOptions & ClientActionObject_Temp} ClientActionObject
 */

/**
 * @typedef {Object} ClientActionRunnerProxy
 * A wrapper around an instance's data in the store that makes it easier to get state and commit
 * mutations.
 * @property {string} id
 * Client action runner instance ID used to retrieve an instance from the store.
 * @property {string} actionId
 * @property {Client} client
 * @property {Object} config
 * @property {number} loggedInTabId
 * @property {TaskObject} task
 * @property {Object} input
 * @property {Object} retryInput
 * @property {string} retryReason The reason why this instance should be retried.
 * @property {boolean} shouldRetry Whether this instance should be retried.
 * @property {any} error
 * @property {any} output
 * @property {boolean} running
 */

/**
 * The part of a client action that will actually be run.
 * Each client action runner instance can have its own client, options, parent task, errors and
 * output.
 * @abstract
 */
export class ClientActionRunner {
  /**
   * @param {ClientActionObject} action
   */
  constructor(action) {
    this.action = action;
  }

  /**
   * @param {string} id ID of runner instance in Vuex store.
   */
  create(id) {
    this.id = id;

    /**
     * @type {ClientActionRunnerProxy}
     * A wrapper around this instance's data in the store to make it easier to get state and commit
     * mutations.
     */
    this.storeProxy = new Proxy({}, {
      get: (_obj, prop) => {
        const state = store.state.clientActions.instances[this.id];
        if (typeof prop === 'string' && prop in state) {
          return state[prop];
        }
        return undefined;
      },
      set: (_obj, prop, value) => {
        store.commit('clientActions/setInstanceProperty', { id: this.id, prop, value });
        return true;
      },
    });

    this.storeProxy.id = this.id;
    this.storeProxy.actionId = this.action.id;
    this.storeProxy.input = this.action.defaultInput();
    this.storeProxy.retryInput = {};
  }

  /**
   * Initializes the runner. Must be called before `run()` is called.
   * @param {Object} data
   * @param {Client} data.client
   * @param {Object} data.config this client action's config
   */
  init(data) {
    this.storeProxy.client = data.client;
    this.storeProxy.config = data.config;
    this.storeProxy.loggedInTabId = null;
    this.storeProxy.task = null;

    // Run status data
    this.storeProxy.error = null;
    this.storeProxy.output = null;
    this.storeProxy.running = false;
    this.storeProxy.shouldRetry = null;
    this.storeProxy.retryReason = null;
  }

  /**
   * Private method that contains the actual business logic of the runner. This is overwritten by
   * the actual client action runners which extend `ClientActionRunner`.
   *
   * When run, the client, options and parent task will all be available.
   * @private
   * @abstract
   */
  runInternal() {
    this.storeProxy.task.state = taskStates.SUCCESS;
  }

  /**
   * Runs the business logic of the runner.
   *
   * This is just a wrapper for `runInternal` where the actual runner resides.
   * This prepares data such as the parent task and logged in tab ID for use by `runInternal` as
   * well as setting this runner's error if `runInternal` fails.
   * @param {Object} data
   * @param {number} data.loggedInTabId ID of the logged in tab.
   * @param {TaskObject} data.task
   */
  async run(data) {
    this.storeProxy.loggedInTabId = data.loggedInTabId;
    this.storeProxy.task = data.task;
    try {
      this.storeProxy.running = true;
      await this.runInternal();
    } catch (error) {
      this.storeProxy.error = error;
      throw error;
    } finally {
      this.storeProxy.running = false;
    }
  }

  /**
   * Called after this runner has finished running to decide whether it failed in some way and
   * should be run again.
   */
  checkIfShouldRetry() {
    // Don't override any retry reasons that have already been given.
    if (this.storeProxy.shouldRetry === null) {
      const { error } = this.storeProxy;
      if (error !== null) {
        // Don't retry if client's username or password is invalid or their password has expired.
        if (
          error instanceof ExtendedError
          && (
            error.type === 'LoginError'
            && (error.code === 'PasswordExpired' || error.code === 'InvalidUsernameOrPassword')
          )
        ) {
          this.storeProxy.shouldRetry = false;
        } else {
          this.setRetryReason(errorToString(error));
        }
      } else {
        this.storeProxy.shouldRetry = false;
      }
    }
  }

  /**
   * Indicates that an instance should be retried and why.
   * @param {string} reason The reason why this instance should be retried.
   */
  setRetryReason(reason) {
    this.storeProxy.shouldRetry = true;
    this.storeProxy.retryReason = reason;
  }
}

/**
 * Validates a client action's options.
 * @param {ClientActionObject} options
 * @throws {Error}
 */
function validateActionOptions(options) {
  const errors = [];
  if (options.hasOutput) {
    const validFormats = Object.values(exportFormatCodes);

    const requiredProperties = ['defaultOutputFormat', 'outputFormats', 'outputFormatter'];
    const missing = objectHasProperties(options, requiredProperties);
    if (
      !missing.includes('defaultOutputFormat')
      && !validFormats.includes(options.defaultOutputFormat)
    ) {
      errors.push(`${JSON.stringify(options.defaultOutputFormat)} is not a valid default output format`);
    }
    if (!missing.includes('outputFormats')) {
      if (!(Array.isArray(options.outputFormats))) {
        errors.push("Property 'outputFormats' must be an array");
      } else {
        const invalid = [];
        for (const format of options.outputFormats) {
          if (!validFormats.includes(format)) {
            invalid.push(format);
          }
        }
        if (invalid.length > 0) {
          errors.push(`Unknown output format types: ${JSON.stringify(invalid)}`);
        }
      }
    }
    if (!missing.includes('outputFormatter') && !(typeof options.outputFormatter === 'function')) {
      errors.push('Output formatter must be a function');
    }

    if (missing.length > 0) {
      errors.push(`If 'hasOutput' is set to true, ${joinSpecialLast(missing, ', ', ' and ')} must be provided`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`InvalidClientActionOptions: ${errors.join(', ')}`);
  }
}


/**
 * Creates a new client action from an object.
 * Default options are assigned and then the action is validated.
 * @param {ClientActionOptions} options
 * @returns {ClientActionObject}
 */
export function createClientAction(options) {
  const clientAction = Object.assign({
    defaultInput: () => ({}),
    hasOutput: false,
    usesLoggedInTab: false,
    requiresTaxTypes: false,
    requiredFeatures: [],
    logCategory: options.id,
  }, options);

  validateActionOptions(clientAction);

  return clientAction;
}

/**
 * Checks if a runner has an input that matches the specified dot notation path.
 * @param {Object} input
 * @param {string} path The dot notation path.
 * @returns {boolean}
 */
export function inputExists(input, path) {
  return has(input, path);
}

/**
 * Gets a runner's input using a dot notation path. Also, returns if the input existed.
 * @param {Object} input
 * @param {string} path The dot notation path.
 * @param {Object} options
 * @param {boolean} [options.checkArrayLength]
 * Set to false to disable checking if array type inputs have at least one item.
 * @param {any} [options.defaultValue]
 * Default value to return if the input doesn't exist or is invalid.
 */
export function getInput(input, path, options = {}) {
  const { checkArrayLength = true } = options;

  let value = get(input, path);
  let exists = typeof value !== 'undefined';
  if (exists && checkArrayLength && Array.isArray(value) && value.length === 0) {
    exists = false;
  }
  if (!exists && 'defaultValue' in options) {
    value = options.defaultValue;
  }
  return {
    exists,
    value,
  };
}
