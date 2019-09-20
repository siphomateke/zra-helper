import { ExportFormatCode, Client, BrowserFeature } from '@/backend/constants';
import { objectHasProperties, joinSpecialLast, deepAssign } from '@/utils';
import { ExtendedError, errorToString } from '../errors';
import store from '@/store';
import { TaskState } from '@/store/modules/tasks';
import { ClientActionOutputs } from '@/store/modules/client_actions/types';
import { TaskObject } from '@/transitional/tasks';
import { has, get } from 'dot-prop';
import { Rules } from 'vee-validate';

type ClientActionOutputFileValue = any;

export interface ClientActionOutputFormatterOptions<Output> {
  clients: Client[];
  allClients: Client[]
  output: Output;
  format: ExportFormatCode;
  /** Whether client data in the output should be anonymized. */
  anonymizeClients: boolean;
}

export type ClientActionOutputFormatter<O> = (options: ClientActionOutputFormatterOptions<O>) => string;

interface ClientActionOutputFile<Output extends ClientActionOutputFileValue> {
  label: string;
  /** 
   * Whether this output file is not an actual output file but just a wrapper for others. If this is
   * set to true, `children` must also be set. 
   */
  wrapper: boolean;
  filename?: string;
  /** The actual value of this output file that will be passed to the formatter. */
  value?: Output;
  /** The export formats this client action can output. Must be set if `wrapper` is false. */
  formats?: ExportFormatCode[];
  /**
   * Default output format. Must be set if `wrapper` is false.
   * If not provided, the first format will be the default.
   */
  defaultFormat?: ExportFormatCode;
  /** Function that formats the output into different formats such as CSV and JSON. */
  formatter?: ClientActionOutputFormatter<Output>;
  /** Whether this output should be shown to the user without having to use one of the export buttons. */
  preview?: boolean;
  children: ClientActionOutputFile<any>[];
}

interface ClientActionOutputFilesGeneratorFnOptions<Output> {
  clients: Client[];
  allClients: Client[];
  outputs: Output;
}

type ClientActionOutputFilesGenerator<O> = (options: ClientActionOutputFilesGeneratorFnOptions<O>) => ClientActionOutputFile<O>;

export namespace BaseFormattedOutput {
  export namespace CSV {
    export type ClientOutput<Row> = { [taxTypeCode in TaxTypeCode]?: Row[] };
    export type Output<Row> = {
      [clientIdentifier: string]: ClientOutput<Row>;
    }
  }

  export namespace JSON {
    export interface Client {
      id: number;
      name?: string;
      username?: string;
    }
    export type Output<ClientOutput> = {
      [clientId: number]: ClientOutput | null;
    }
  }
}

// FIXME: Express in type that output settings are required if hasOutput = true.
export interface ClientActionOptions<Input extends object, Output = BasicRunnerOutput> {
  /** A unique camelCase ID to identify this client action. */
  id: string;
  /** The human-readable name of this client action. */
  name: string;
  // FIXME: Type this properly based on the current client.
  defaultInput?: () => Input;
  /** Vee-validate validator for each input property. */
  inputValidation?: { [inputProperty in keyof Input]: string | Rules };
  requiredFeatures?: BrowserFeature[];
  /**
   * Whether this action needs to open a page from a logged in tab.
   * If this is enabled, the page that is opened after logging in will not be closed until the user is
   * about to be logged out.
   */
  usesLoggedInTab?: boolean;
  requiresTaxTypes?: boolean;
  /** Actions that must be run before this one and whose output will be used. */
  requiredActions?: string[];
  /** Whether this client action returns an output. */
  hasOutput?: boolean;
  /** Function that generates output(s) of the action based on the raw output data of each client. */
  generateOutputFiles?: ClientActionOutputFilesGenerator<ClientActionOutputs<Output>>;
}

export interface ClientActionObject<
  Input extends object,
  Output = BasicRunnerOutput,
  Runner extends ClientActionRunner<Input, Output> = ClientActionRunner<Input, Output>
  > extends ClientActionOptions<Input, Output> {
  /** The log category to use when logging anything in this action. */
  logCategory: string;
  Runner: { new(): Runner };
}

// FIXME: Actually use this strongly typed version elsewhere
export interface TypedClientActionRunnerProxy<Input, Output, Config> {
  /** Client action runner instance ID used to retrieve an instance from the store. */
  id: string;
  actionId: string;
  client: Client;
  config: Config;
  loggedInTabId: number | null;
  task: TaskObject | null;
  input: Input;
  retryInput: Input;
  /** The reason why this instance should be retried. */
  retryReason: string;
  /** Whether this instance should be retried. */
  shouldRetry: boolean;
  error: any | null;
  output: Output | null;
  /**
   * Output of this run/retry and its previous run.
   * TODO: Actually store all run outputs.
   */
  allRunOutputs: Output[];
  running: boolean;
  /** IDs of instances this instance depends on. */
  dependencies: string[];
}

export type ClientActionRunnerProxy = TypedClientActionRunnerProxy<any, any, any>;

/** Options for {@link ClientActionRunner.init} */
interface RunnerInitOptions<Config> {
  client: Client;
  /** This client action's config. */
  config: Config;
}

interface RunnerRunOptions {
  /** ID of the logged in tab. */
  loggedInTabId: number;
  task: TaskObject;
}

export interface BasicRunnerInput { }
export interface BasicRunnerOutput { }
export interface BasicRunnerConfig { }

/**
 * The part of a client action that will actually be run.
 * Each client action runner instance can have its own client, options, parent task, errors and
 * output.
 */
// FIXME: Detect circular references of required actions.
export abstract class ClientActionRunner<
  Input extends object = BasicRunnerInput,
  Output = BasicRunnerOutput,
  Config = BasicRunnerConfig
  > {
  id: string | null = null;

  storeProxy: TypedClientActionRunnerProxy<Input, Output, Config>;

  constructor(public action: ClientActionObject<Input, Output>) { }

  /**
   * @param id ID of runner instance in Vuex store.
   */
  create(id: string) {
    this.id = id;

    /**
     * A wrapper around this instance's data in the store to make it easier to get state and commit
     * mutations.
     */
    this.storeProxy = new Proxy(
      {},
      {
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
      },
    );

    this.storeProxy.id = this.id;
    this.storeProxy.actionId = this.action.id;
    this.storeProxy.input = this.action.defaultInput();
    this.storeProxy.retryInput = {};
  }

  /**
   * Initializes the runner. Must be called before `run()` is called.
   */
  init(data: RunnerInitOptions<Config>) {
    this.storeProxy.client = data.client;
    this.storeProxy.config = data.config;
    this.storeProxy.loggedInTabId = null;
    this.storeProxy.task = null;
    this.storeProxy.dependencies = [];

    // Run status data
    this.storeProxy.error = null;
    this.storeProxy.allRunOutputs = [];
    this.storeProxy.output = null;
    this.storeProxy.running = false;
    this.storeProxy.shouldRetry = false;
    this.storeProxy.retryReason = '';
  }

  setOutput(output: Output) {
    this.storeProxy.allRunOutputs.push(output);
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

  // eslint-disable-next-line class-methods-use-this
  mergeRunOutputs(prevOutput: Output, output: Output) {
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
    const merged = outputs.reduce((prevOutput: Output, output: Output) => {
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

  getInstance(actionId: string): ActionInstanceData {
    // TODO: Change this to support multiple actions of the same type in a client
    const { currentRunId } = store.state.clientActions;
    const instance: ClientActionRunnerProxy = store.getters['clientActions/getInstance'](currentRunId, actionId, this.storeProxy.client.id);
    return instance;
  }
}

/**
 * Validates a client action output file.
 * @returns Validation errors
 */
export function validateActionOutputFile<
  Output,
  ActionOptions extends Partial<ClientActionOutputFile<Output>>
>(options: ActionOptions): string[] {
  const errors = [];

  const nonWrapperProperties: Array<keyof ClientActionOutputFile<Output>> = [
    'value',
    'filename',
    'formats',
    'defaultFormat',
    'formatter',
    'preview',
  ];

  if (!options.wrapper) {
    const { missing } = objectHasProperties(options, nonWrapperProperties);

    const validFormats: ExportFormatCode[] = Object.values(ExportFormatCode);
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
 * @returns Validation errors
 */
function validateActionOptions<I extends object, O>(options: Partial<ClientActionObject<I, O>>): string[] {
  const errors = [];
  if (options.hasOutput) {
    const requiredProperties: Array<keyof ClientActionObject<I, O>> = [
      'generateOutputFiles',
    ];
    const { missing } = objectHasProperties(options, requiredProperties);
    if (!missing.includes('generateOutputFiles') && typeof options.generateOutputFiles !== 'function') {
      errors.push('generateOutputFiles property must be a function');
    }
    // FIXME: Figure out how to validate generateOutputFiles response before running. It's difficult
    // because the output files are generated dynamically based on the output.

    if (missing.length > 0) {
      errors.push(
        `If 'hasOutput' is set to true, ${joinSpecialLast(missing, ', ', ' and ')} must be provided`,
      );
    }
  }
  return errors;
}

/**
 * Creates a client action output file and validates it.
 * @throws {Error}
 */
export function createOutputFile<Output>(
  options: Partial<ClientActionOutputFile<Output>>
): ClientActionOutputFile<Output> {
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
 */
export function createClientAction<
  Input extends object,
  Output = BasicRunnerOutput
>(options: ClientActionOptions<Input, Output>): ClientActionObject<Input, Output> {
  const clientAction = Object.assign(
    {
      defaultInput: () => ({}),
      hasOutput: false,
      usesLoggedInTab: false,
      requiresTaxTypes: false,
      requiredActions: [],
      requiredFeatures: [],
      logCategory: options.id,
    },
    options,
  );

  const errors = validateActionOptions(clientAction);
  if (errors.length > 0) {
    throw new Error(`InvalidClientActionOptions: ${errors.join(', ')}`);
  }

  return clientAction;
}

/**
 * Checks if a runner has an input that matches the specified dot notation path.
 * @param path The dot notation path.
 */
export function inputExists(input: object, path: string): boolean {
  return has(input, path);
}

interface GetInputFnOptions {
  /** Set to false to disable checking if array type inputs have at least one item. */
  checkArrayLength?: boolean;
  /** Default value to return if the input doesn't exist or is invalid. */
  defaultValue?: any;
}

interface GetInputFnResponse<T> {
  /** Whether the input at the provided path exists. */
  exists: boolean;
  /** Value of input or default value if it was specified. */
  value: T;
}

/**
 * Gets a runner's input using a dot notation path. Also, returns if the input existed.
 * @param path The dot notation path.
 */
// FIXME: Make sure generic `T` is never undefined when a non-undefined defaultValue is provided.
export function getInput<T>(
  input: object,
  path: string,
  options: GetInputFnOptions = {},
): GetInputFnResponse<T> {
  const { checkArrayLength = true } = options;

  let value: any = get(input, path);
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
