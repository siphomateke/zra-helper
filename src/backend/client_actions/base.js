import { exportFormatCodes } from '@/backend/constants';
import {
  objectHasProperties, joinSpecialLast, deepAssign,
} from '@/utils';
import { ExtendedError, errorToString } from '../errors';
import store from '@/store';
import { taskStates } from '@/store/modules/tasks';
import { has, get } from 'dot-prop';

/**
 * @typedef {import('@/backend/constants').Client} Client
 * @typedef {import('../constants').ExportFormatCode} ExportFormatCode
 * @typedef {import('@/transitional/tasks').TaskObject} TaskObject
 */

/** @typedef {any} ClientActionOutputFileValue */

/**
 * @typedef {import('@/store/modules/client_actions').ClientActionOutputs} ClientActionOutputs
 *
 * @typedef {Object} ClientActionOutputFormatterOptions
 * @property {Client[]} clients
 * @property {Client[]} allClients
 * @property {ClientActionOutputFileValue} output
 * @property {ExportFormatCode} format
 * @property {boolean} anonymizeClients Whether client data in the output should be anonymized.
 *
 * @callback ClientActionOutputFormatter
 * @param {ClientActionOutputFormatterOptions} options
 * @returns {string}
 */

/**
 * @typedef {Object} ClientActionOutputFile
 * @property {string} label
 * @property {boolean} wrapper
 * Whether this output file is not an actual output file but just a wrapper for others. If this is
 * set to true, `children` must also be set.
 * @property {string} [filename]
 * @property {ClientActionOutputFileValue} [value]
 * The actual value of this output file that will be passed to the formatter.
 * @property {ExportFormatCode[]} [formats]
 * The export formats this client action can output. Must be set if `wrapper` is false.
 * @property {ExportFormatCode} [defaultFormat]
 * Default output format. Must be set if `wrapper` is false.
 * If not provided, the first format will be the default.
 * @property {ClientActionOutputFormatter} [formatter]
 * Function that formats the output into different formats such as CSV and JSON.
 * @property {boolean} [preview]
 * Whether this output should be shown to the user without having to use one of the export buttons.
 * @property {ClientActionOutputFile[]} children
 */

/**
 * @typedef {Object} ClientActionOutputFilesGeneratorFnOptions
 * @property {Client[]} clients
 * @property {Client[]} allClients
 * @property {ClientActionOutputs} outputs
 *
 * @callback ClientActionOutputFilesGenerator
 * @param {ClientActionOutputFilesGeneratorFnOptions} options
 * @returns {ClientActionOutputFile}
 */

/**
 * @typedef ClientActionOptions
 * @property {string} id A unique camelCase ID to identify this client action.
 * @property {string} name The human-readable name of this client action.
 * @property {new () => ClientActionRunner} [Runner]
 * @property {() => Object} [defaultInput]
 * @property {Object.<string, string|import('vee-validate').Rules>} [inputValidation]
 * Vee-validate validator for each input property.
 * @property {import('@/backend/constants').BrowserFeature[]} [requiredFeatures]
 * Features this action requires that are only available in certain browsers.
 * @property {boolean} [usesLoggedInTab]
 * Whether this action needs to open a page from a logged in tab.
 * If this is enabled, the page that is opened after logging in will not be closed until the user is
 * about to be logged out.
 * @property {boolean} [requiresTaxTypes]
 * @property {string[]} [requiredActions]
 * Actions that must be run before this one and whose output will be used.
 * @property {boolean} [hasOutput] Whether this client action returns an output.
 * @property {ClientActionOutputFilesGenerator} [generateOutputFiles]
 * Function that generates output(s) of the action based on the raw output data of each client.
 *
 * @typedef {Object} ClientActionObject_Temp
 * @property {string} logCategory The log category to use when logging anything in this action.
 *
 * @typedef {ClientActionOptions & ClientActionObject_Temp} ClientActionObject
 */

/**
 * @template {any} Output
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
 * @property {Output} output
 * @property {Output[]} allRunOutputs
 * Output of this run/retry and its previous run.
 * TODO: Actually store all run outputs.
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
        const state = store.getters['clientActions/getInstanceById'](this.id);
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
    this.storeProxy.allRunOutputs = [];
    this.storeProxy.output = null;
    this.storeProxy.running = false;
    this.storeProxy.shouldRetry = null;
    this.storeProxy.retryReason = null;
  }

  setOutput(output) {
    this.storeProxy.allRunOutputs.push(output);
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

  // eslint-disable-next-line class-methods-use-this
  mergeRunOutputs(prevOutput, output) {
    return deepAssign(prevOutput, output, {
      clone: true,
      concatArrays: true,
    });
  }

  /**
   * Merges all the outputs of the retries of this action into a single output.
   *
   * Called in client_actions/index.js even if logging in failed.
   */
  mergeAllRunOutputs() {
    const outputs = this.storeProxy.allRunOutputs;
    const merged = outputs.reduce((prevOutput, output) => {
      if (prevOutput !== null && output !== null) {
        return this.mergeRunOutputs(prevOutput, output);
      }
      // If any of the outputs are null, use the non-null output. Null outputs are failures
      // and can thus be ignored.
      if (output !== null) {
        return output;
      } if (prevOutput !== null) {
        return prevOutput;
      }
      return null;
    }, null);
    this.storeProxy.output = merged;
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

  getActionOutput(actionId) {
    // TODO: Change this to support multiple actions of the same type in a client
    const { currentRunId } = store.state.clientActions;
    /** @type {import('@/store/modules/client_actions').ActionInstanceData} */
    const instance = store.getters['clientActions/getInstance'](currentRunId, actionId, this.storeProxy.client.id);
    return instance.output;
  }
}

/**
 * Validates a client action output file.
 * @param {Partial<ClientActionOutputFile>} options
 * @returns {string[]} Validation errors
 */
export function validateActionOutputFile(options) {
  const errors = [];

  const nonWrapperProperties = [
    'value',
    'filename',
    'formats',
    'defaultFormat',
    'formatter',
    'preview',
  ];

  if (!options.wrapper) {
    const { missing } = objectHasProperties(options, nonWrapperProperties);

    const validFormats = Object.values(exportFormatCodes);
    if (
      !missing.includes('defaultFormat')
      && !validFormats.includes(options.defaultFormat)
    ) {
      errors.push(`${JSON.stringify(options.defaultFormat)} is not a valid default output format`);
    }
    if (!missing.includes('formats')) {
      if (!(Array.isArray(options.formats))) {
        errors.push("Property 'formats' must be an array");
      } else {
        const invalid = [];
        for (const format of options.formats) {
          if (!validFormats.includes(format)) {
            invalid.push(format);
          }
        }
        if (invalid.length > 0) {
          errors.push(`Unknown output format types: ${JSON.stringify(invalid)}`);
        }
      }
    }
    if (!missing.includes('formatter') && typeof options.formatter !== 'function') {
      errors.push('Output file formatter must be a function');
    }
    if (missing.length > 0) {
      errors.push(`Output file's require the following properties: ${joinSpecialLast(missing, ', ', ' and ')}`);
    }
  } else {
    const { existing: invalidProperties } = objectHasProperties(options, nonWrapperProperties);
    if (invalidProperties.length > 0) {
      errors.push(`Output file wrapper has invalid properties: ${joinSpecialLast(invalidProperties, ', ', ' and ')}`);
    }
  }

  if (options.children.length > 0) {
    if (!options.wrapper) {
      errors.push('Only wrapper output files can have children');
    } else {
      for (const child of options.children) {
        const childErrors = validateActionOutputFile(child);
        // FIXME: Indicate child errors better.
        errors.push(...childErrors);
      }
    }
  } else if (options.wrapper) {
    errors.push('Wrapper output files must have children.');
  }

  return errors;
}

/**
 * Validates a client action's options.
 * @param {ClientActionObject} options
 * @returns {string[]} Validation errors
 */
function validateActionOptions(options) {
  const errors = [];
  if (options.hasOutput) {
    const requiredProperties = [
      'generateOutputFiles',
    ];
    const { missing } = objectHasProperties(options, requiredProperties);
    if (!missing.includes('generateOutputFiles') && typeof options.generateOutputFiles !== 'function') {
      errors.push('generateOutputFiles property must be a function');
    }
    // FIXME: Figure out how to validate generateOutputFiles response before running. It's difficult
    // because the output files are generated dynamically based on the output.

    if (missing.length > 0) {
      errors.push(`If 'hasOutput' is set to true, ${joinSpecialLast(missing, ', ', ' and ')} must be provided`);
    }
  }
  return errors;
}

/**
 * Creates a client action output file and validates it.
 * @param {Partial<ClientActionOutputFile>} options
 * @returns {ClientActionOutputFile}
 * @throws {Error}
 */
export function createOutputFile(options) {
  if (typeof options !== 'object') {
    throw new Error(`Client action output files must be objects, not ${typeof options}`);
  }
  let outputFile = Object.assign({
    label: '',
    wrapper: false,
    children: [],
  }, options);


  if (!outputFile.wrapper) {
    // If a default format wasn't set, use the first one.
    if (!('defaultFormat' in outputFile)
      && 'formats' in outputFile
      && outputFile.formats.length > 0
    ) {
      [outputFile.defaultFormat] = outputFile.formats;
    }
    outputFile = Object.assign({
      filename: 'output',
      value: null,
      preview: false,
    }, outputFile);
  }

  const errors = validateActionOutputFile(outputFile);
  if (errors.length > 0) {
    throw new Error(`InvalidClientActionOutputFile: ${errors.join(', ')}`);
  }

  return outputFile;
}


/**
 * Creates a new client action from an object.
 * Default options are assigned and then the action is validated.
 * @param {ClientActionOptions} options
 * @returns {ClientActionObject}
 * @throws {Error}
 */
export function createClientAction(options) {
  const clientAction = Object.assign({
    defaultInput: () => ({}),
    hasOutput: false,
    usesLoggedInTab: false,
    requiresTaxTypes: false,
    requiredActions: [],
    requiredFeatures: [],
    logCategory: options.id,
  }, options);

  const errors = validateActionOptions(clientAction);
  if (errors.length > 0) {
    throw new Error(`InvalidClientActionOptions: ${errors.join(', ')}`);
  }

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
