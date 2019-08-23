import {
  ClientActionObject,
  ClientActionRunnerProxy,
  ClientActionRunner,
} from '@/backend/client_actions/base';
import { Client } from '@/backend/constants';
import { TaskId } from '../tasks';
import { ExtendedError } from '@/backend/errors';

/** Contains all the client action instances from a single run of the extension. */
export interface ActionRun {
  /**
   * IDs of instances from this run grouped by action ID. Instances are stored by action ID to make
   * it easier to combine all outputs from all clients of a single action into a single output.
   */
  instancesByActionId: { [actionId: string]: string[] };
  /** The ID of the task associated with this run. */
  taskId: TaskId;
  /** Whether the run is still in progress or has completed. */
  running: boolean;
  /** All clients from the client list */
  allClients: Client[];
  /** The clients that actions were actually run on. */
  clients: Client[];
}

export interface ClientActionFailure {
  clientId: number;
  actionId: string;
  error?: ExtendedError;
}

/** Failures grouped by Client ID. */
export type ClientActionFailuresByClient = { [clientId: number]: ClientActionFailure[] };

/**
 * Data for a single instance of a client action runner. New instances are created each run allowing
 * the outputs from each run to be stored and displayed. This actual run method is contained in a
 * [ActionInstanceClass]{@link ActionInstanceClass} which can be retrieved from `instanceClasses`.
 */
export type ClientActionInstanceData = ClientActionRunnerProxy;

/**
 * Single instance of a client action runner that contains the actual run method.
 */
// FIXME: Use correct types
export type ClientActionInstanceClass = ClientActionRunner<any, any, any>;

export interface ClientActionOutput<O> {
  actionId: string;
  clientId: number;
  value: O | null;
  error: Error | null;
  input: any; // FIXME: Get type of client action input
}

/** Client action runner outputs grouped by client ID. */
export type ClientActionOutputs<Output> = { [clientId: string]: ClientActionOutput<Output> };

export namespace ClientActions {
  export interface State {
    /** Client actions stored by IDs. */
    // FIXME: Type this properly
    actions: { [actionId: string]: ClientActionObject<any, any> };
    /** Client action runner instances' data stored by instance ID. */
    instances: { [instanceId: string]: ClientActionInstanceData };
    /** Action runs stored by run IDs. */
    runs: ActionRun[];
    /** Which run the program is currently on. */
    currentRunId: number | null;
  }
}
