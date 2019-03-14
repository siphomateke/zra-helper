import { exportFormatCodes } from '@/backend/constants';
import { objectHasProperties, joinSpecialLast } from '@/utils';
import { taskStates } from '@/store/modules/tasks';
import { ExtendedError } from '../errors';

/**
 * @typedef {import('@/backend/constants').Client} Client
 * @typedef {import('../constants').ExportFormatCode} ExportFormatCode
 */

/**
 * @typedef {import('@/store/modules/client_actions').ClientActionOutput} ClientActionOutput
 * @typedef {import('@/store/modules/client_actions').ClientActionOutputs} ClientActionOutputs
 *
 * @callback ClientActionOutputFormatter
 * @param {Client[]} clients
 * @param {ClientActionOutputs} outputs
 * @param {ExportFormatCode} format
 * @returns {string}
 */

/**
 * @typedef ClientActionOptions
 * @property {string} id A unique camelCase ID to identify this client action.
 * @property {string} name The human-readable name of this client action.
 * @property {new () => ClientActionRunner} [runner]
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
   * Initializes the runner. Must be called before `run()` is called.
   * @param {Object} data
   * @param {Client} data.client
   * @param {Object} data.config this client action's config
   */
  init(data) {
    this.client = data.client;
    this.config = data.config;
    this.loggedInTabId = null;
    this.parentTask = null;

    // Run status data
    this.error = null;
    this.output = null;
  }

  /**
   * Private method that contains the actual business logic of the runner. This is overwritten by
   * the actual client action runners which extend `ClientActionRunner`. The default implementation
   * just sets the parent task's state to success.
   *
   * When run, the client, options and parent task will all be available.
   * @private
   */
  runInternal() {
    this.parentTask.state = taskStates.SUCCESS;
  }

  /**
   * Runs the business logic of the runner.
   *
   * This is just a wrapper for `runInternal` where the actual runner resides.
   * This prepares data such as the parent task and logged in tab ID for use by `runInternal` as
   * well as setting this runner's error if `runInternal` fails.
   * @param {Object} data
   * @param {number} data.loggedInTabId ID of the logged in tab.
   * @param {import('@/transitional/tasks').TaskObject} data.parentTask
   */
  async run(data) {
    this.loggedInTabId = data.loggedInTabId;
    this.parentTask = data.parentTask;
    try {
      await this.runInternal();
    } catch (error) {
      this.error = error;
      throw error;
    }
  }

  /**
   * Function called after the runner has finished running that should decide whether the runner
   * failed and should be run again.
   *
   * Can be overwritten by runners for more advanced behavior.
   * @returns {boolean}
   */
  shouldRetry() {
    if (this.error !== null && this.error instanceof ExtendedError) {
      // Don't retry if client's username or password is invalid or their password has expired.
      if (
        this.error.type === 'LoginError'
        && (this.error.code === 'PasswordExpired' || this.error.code === 'InvalidUsernameOrPassword')
      ) {
        return false;
      }
    }

    // TODO: Instead of checking task state, explicitly set actions as failed in their shouldRetry
    // methods.
    if (this.error !== null || (this.parentTask && this.parentTask.state === taskStates.ERROR)) {
      return true;
    }

    return false;
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
    hasOutput: false,
    usesLoggedInTab: false,
    requiresTaxTypes: false,
    requiredFeatures: [],
    logCategory: options.id,
  }, options);

  // A logged in tab is required to get tax types
  if (clientAction.requiresTaxTypes) {
    clientAction.usesLoggedInTab = true;
  }

  validateActionOptions(clientAction);

  return clientAction;
}
