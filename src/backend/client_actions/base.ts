import { ExportFormatCode, Client, BrowserFeature } from '@/backend/constants';
import { objectHasProperties, joinSpecialLast } from '@/utils';
import { ExtendedError, errorToString } from '../errors';
import store from '@/store';
import { TaskState } from '@/store/modules/tasks';
import { ClientActionOutputs } from '@/store/modules/client_actions/types';
import { TaskObject } from '@/transitional/tasks';

interface ClientActionOutputFormatterOptions {
  clients: Client[];
  outputs: ClientActionOutputs;
  format: ExportFormatCode;
  /** Whether client data in the output should be anonymized. */
  anonymizeClients: boolean;
}

type ClientActionOutputFormatter = (options: ClientActionOutputFormatterOptions) => string;

// FIXME: Express in type that output settings are required if hasOutput = true.
interface ClientActionOptions {
  /** A unique camelCase ID to identify this client action. */
  id: string;
  /** The human-readable name of this client action. */
  name: string;
  // FIXME: Type this properly based on the current client.
  defaultInput?: () => object;
  requiredFeatures?: BrowserFeature[];
  /**
   * Whether this action needs to open a page from a logged in tab.
   * If this is enabled, the page that is opened after logging in will not be closed until the user is
   * about to be logged out.
   */
  usesLoggedInTab?: boolean;
  requiresTaxTypes?: boolean;
  /** Whether this client action returns an output. */
  hasOutput?: boolean;
  /** Default output format. Must be set if `hasOutput` is set. */
  defaultOutputFormat?: ExportFormatCode;
  /** The export formats this client action can output. Must be set if `hasOutput` is set. */
  outputFormats?: ExportFormatCode[];
  /** Function that formats the output into different formats such as CSV and JSON. */
  outputFormatter?: ClientActionOutputFormatter;
}

export interface ClientActionObject extends ClientActionOptions {
  /** The log category to use when logging anything in this action. */
  logCategory: string;
  Runner: typeof ClientActionRunner;
}

export interface ClientActionRunnerProxy {
  /** Client action runner instance ID used to retrieve an instance from the store. */
  id: string;
  actionId: string;
  client: Client;
  config: object;
  loggedInTabId: number;
  task: TaskObject;
  input: object;
  retryInput: object;
  /** The reason why this instance should be retried. */
  retryReason: string;
  /** Whether this instance should be retried. */
  shouldRetry: boolean;
  error: any;
  output: any;
  running: boolean;
}

/** Options for {@link ClientActionRunner.init} */
interface RunnerInitOptions {
  client: Client;
  /** This client action's config. */
  config: object;
}

interface RunnerRunOptions {
  /** ID of the logged in tab. */
  loggedInTabId: number;
  task: TaskObject;
}

/**
 * The part of a client action that will actually be run.
 * Each client action runner instance can have its own client, options, parent task, errors and
 * output.
 */
export abstract class ClientActionRunner {
  storeProxy: ClientActionRunnerProxy;

  /**
   * @param id ID of runner instance in Vuex store.
   */
  constructor(public id: string, action: ClientActionObject) {
    /**
     * A wrapper around this instance's data in the store to make it easier to get state and commit
     * mutations.
     */
    this.storeProxy = new Proxy(
      {},
      {
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
      },
    );

    this.storeProxy.id = this.id;
    this.storeProxy.actionId = action.id;
    this.storeProxy.input = action.defaultInput();
    this.storeProxy.retryInput = {};
  }

  /**
   * Initializes the runner. Must be called before `run()` is called.
   */
  init(data: RunnerInitOptions) {
    this.storeProxy.client = data.client;
    this.storeProxy.config = data.config;
    this.storeProxy.loggedInTabId = null;
    this.storeProxy.task = null;

    // Run status data
    this.storeProxy.error = null;
    this.storeProxy.output = null;
    this.storeProxy.running = false;
    this.storeProxy.shouldRetry = false;
    this.storeProxy.retryReason = '';
  }

  /**
   * Private method that contains the actual business logic of the runner. This is overwritten by
   * the actual client action runners which extend `ClientActionRunner`.
   *
   * When run, the client, options and parent task will all be available.
   */
  protected runInternal() {
    this.storeProxy.task.state = TaskState.SUCCESS;
  }

  /**
   * Runs the business logic of the runner.
   *
   * This is just a wrapper for `runInternal` where the actual runner resides.
   * This prepares data such as the parent task and logged in tab ID for use by `runInternal` as
   * well as setting this runner's error if `runInternal` fails.
   */
  async run(data: RunnerRunOptions) {
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
          && (error.type === 'LoginError'
            && (error.code === 'PasswordExpired' || error.code === 'InvalidUsernameOrPassword'))
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
   * @param reason The reason why this instance should be retried.
   */
  setRetryReason(reason: string) {
    this.storeProxy.shouldRetry = true;
    this.storeProxy.retryReason = reason;
  }
}

/**
 * Validates a client action's options.
 * @throws {Error}
 */
function validateActionOptions(options: ClientActionOptions) {
  /** All the validation errors. */
  const errors: string[] = [];
  if (options.hasOutput) {
    const validFormats: ExportFormatCode[] = Object.values(ExportFormatCode);

    const requiredProperties: Array<keyof ClientActionOptions> = [
      'defaultOutputFormat',
      'outputFormats',
      'outputFormatter',
    ];
    const missing = objectHasProperties(options, requiredProperties);
    if (
      !missing.includes('defaultOutputFormat')
      && !validFormats.includes(options.defaultOutputFormat)
    ) {
      errors.push(
        `${JSON.stringify(options.defaultOutputFormat)} is not a valid default output format`,
      );
    }
    if (!missing.includes('outputFormats')) {
      if (!Array.isArray(options.outputFormats)) {
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
      errors.push(
        `If 'hasOutput' is set to true, ${joinSpecialLast(missing, ', ', ' and ')} must be provided`,
      );
    }
  }
  if (errors.length > 0) {
    throw new Error(`InvalidClientActionOptions: ${errors.join(', ')}`);
  }
}

/**
 * Creates a new client action from an object.
 * Default options are assigned and then the action is validated.
 */
export function createClientAction(options: ClientActionOptions): ClientActionObject {
  const clientAction = Object.assign(
    {
      defaultInput: () => ({}),
      hasOutput: false,
      usesLoggedInTab: false,
      requiresTaxTypes: false,
      requiredFeatures: [],
      logCategory: options.id,
    },
    options,
  );

  validateActionOptions(clientAction);

  return clientAction;
}

/**
 * Checks if a key is set in a runner's input
 */
export function inInput(input: object, key: string): boolean {
  if (input && key in input) {
    return true;
  }
  return false;
}
