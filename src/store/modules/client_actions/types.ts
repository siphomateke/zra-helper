import {
  ClientActionObject,
  ClientActionRunnerProxy,
  ClientActionRunner,
} from '@/backend/client_actions/base';
import { Client, BrowserCode } from '@/backend/constants';
import { TaskId } from '../tasks';
import { ExtendedError } from '@/backend/errors';

/** Contains all the client action instances from a single run of the extension. */
export interface ActionRun {
  /**
   * IDs of instances from this run grouped by action ID. Instances are stored by action ID to make
   * it easier to combine all outputs from all clients of a single action into a single output.
   */
  instancesByActionId: { [key: string]: string[] };
  /** The ID of the task associated with this run. */
  taskId: TaskId;
  /** Whether the run is still in progress or has completed. */
  running: boolean;
  clients: Client[];
}

export interface ClientActionFailure {
  clientId: number;
  actionId: string;
  error?: ExtendedError;
}

/** Failures grouped by Client ID. */
export type ClientActionFailuresByClient = { [key: number]: ClientActionFailure[] };

/**
 * Data for a single instance of a client action runner. New instances are created each run allowing
 * the outputs from each run to be stored and displayed. This actual run method is contained in a
 * [ActionInstanceClass]{@link ActionInstanceClass} which can be retrieved from `instanceClasses`.
 */
type ClientActionInstanceData = ClientActionRunnerProxy;

/**
 * Single instance of a client action runner that contains the actual run method.
 */
type ClientActionInstanceClass = ClientActionRunner;

export interface ClientActionOutput {
  actionId: string;
  clientId: number;
  value?: Object;
  error?: Error | null;
}

/** Client action runner outputs grouped by client ID. */
export type ClientActionOutputs = { [key: number]: ClientActionOutput };

export namespace ClientActions {
  export interface State {
    /** Client actions stored by IDs. */
    actions: { [key: string]: ClientActionObject };
    /** Client action runner instances' data stored by instance ID. */
    instances: { [key: string]: ClientActionInstanceData };
    /** Client action runner instances stored by instance ID. */
    instanceClasses: { [key: string]: ClientActionInstanceClass };
    /** Action runs stored by run IDs. */
    runs: ActionRun[];
    /** Which run the program is currently on. */
    currentRunId: number | null;
  }

  export interface Getters {
    getActionById: (id: string) => ClientActionObject;
    getInstanceById: (id: number) => ClientActionInstanceData;
    getInstanceClassById: (id: number) => ClientActionInstanceClass;
    getRunById: (id: number) => ActionRun;
    currentRun: ActionRun;
    previousRun: ActionRun;
    /**
     * Gets the IDs of all the actions in the specified run.
     * @returns IDs of the actions in run.
     */
    getAllActionsInRun: (runId: number) => string[];
    /**
     * Gets all the browsers a particular action supports.
     */
    getBrowsersActionSupports: (id: string) => BrowserCode[];
    /**
     * Checks if an action supports the browser the extension is currently running in.
     */
    actionSupportsCurrentBrowser: (id: string) => boolean;
    /**
     * Whether the extension is currently running some tasks.
     * @returns {boolean}
     */
    running: boolean;
    /**
     * Checks whether all instances of a particular action in a run have outputs.
     */
    actionHasOutput: (runId: string, actionId: string) => boolean;
    /**
     * Gets all the action instances in a run that should be retried.
     */
    getRetryableFailures: (runId: number) => ClientActionFailure[];
    /**
     * All the failures that can be retried in a run grouped by client ID.
     */
    getRetryableFailuresByClient: (runId: number) => ClientActionFailuresByClient;
    /**
     * Gets all the clients from a run that should be retried.
     */
    getClientsToRetry: (runId: number) => Client[];
    /**
     * Checks whether any failures from a run can be retried.
     */
    getAnyRetryableFailures: (runId: number) => boolean;
    /**
     * Gets the IDs of all runs with retryable failures.
     */
    runsWithFailures: number[];
    /**
     * Gets the instance that matches the provided run, action and client IDs.
     */
    getInstance: (runId: number, actionId: string, clientId: number) => ClientActionInstanceData;
    /**
     * Gets the instance from the previous run that matches the provided one.
     */
    getPreviousInstance: (instanceId: string) => ClientActionInstanceData;
    /**
     * Gets the outputs of all client action runner instances whose action IDs match the one
     * specified.
     */
    getOutputsOfAction: (runId: string, actionId: string) => ClientActionOutputs;
    /**
     * Finds a client in a run using a run and client ID.
     */
    getClientFromRun: (runId: number, clientId: string | number) => Client;
  }

  export interface Mutations {}

  export interface Actions {
    test: () => number;
  }

  export interface Modules {}
}
