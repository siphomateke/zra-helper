import Vue from 'vue';
import store from '@/store';
import log from '@/transitional/log';
import createTask from '@/transitional/tasks';
import { taskStates } from '@/store/modules/tasks';
import { MissingTaxTypesError } from '@/backend/errors';
import { robustLogin, logout } from '@/backend/client_actions/user';
import { featuresSupportedByBrowsers, browserCodes } from '@/backend/constants';
import { getCurrentBrowser } from '@/utils';
import notify from '@/backend/notify';
import { closeTab } from '@/backend/utils';
import { taskFunction, getClientIdentifier } from '@/backend/client_actions/utils';

/**
 * @typedef {import('@/backend/constants').Client} Client
 * @typedef {import('@/backend/client_actions/base').ClientActionRunnerProxy} ActionInstanceData
 * Data for a single instance of a client action runner. New instances are created each run allowing
 * the outputs from each run to be stored and displayed. This actual run method is contained in a
 * [ActionInstanceClass]{@link ActionInstanceClass} which can be retrieved from `instanceClasses`.
 * @typedef {import('@/backend/client_actions/base').ClientActionRunner} ActionInstanceClass
 * Single instance of a client action runner that contains the actual run method.
 * @typedef {import('@/backend/client_actions/base').ClientActionObject} ActionObject
 */

/**
 * @typedef {Object} ActionRun
 * Contains all the client action instances from a single run of the extension.
 * @property {Object.<string, string[]>} instancesByActionId
 * IDs of instances from this run grouped by action ID. Instances are stored by action ID to make
 * it easier to combine all outputs from all clients of a single action into a single output.
 * @property {number} taskId The ID of the task associated with this run.
 * @property {boolean} running Whether the run is still in progress or has completed.
 * @property {Client[]} clients
 */

/**
 * @typedef {Object} ClientActionFailure
 * @property {number} clientId
 * @property {string} actionId
 * @property {Error|import('@/backend/errors').ExtendedError} [error]
 *
 * @typedef {Object.<number, ClientActionFailure[]>} ClientActionFailuresByClient
 * Failures grouped by Client ID.
 */

/**
 * @typedef {Object} State
 * @property {Object.<string, ActionObject>} actions Client actions stored by IDs.
 * @property {Object.<string, ActionInstanceData>} instances
 * Client action runner instances' data stored by instance ID.
 * @property {ActionRun[]} runs Action runs stored by run IDs.
 * @property {number} currentRunId Which run the program is currently on.
 */

/** @typedef {import('vuex').ActionContext<State>} VuexActionContext */

/**
 * @typedef {Object} ClientActionOutput
 * @property {string} actionId
 * @property {number} clientId
 * @property {Object} [value]
 * @property {Error|null} [error]
 */

/**
 * @typedef {Object.<number, ClientActionOutput>} ClientActionOutputs
 * Client action runner outputs grouped by client ID.
 */

let lastInstanceId = 0;

/**
 * Creates a new client action runner instance.
 * @param {VuexActionContext} context
 * @param {Object} payload
 * @param {string} payload.actionId
 * @param {Client} payload.client
 *
 * @returns {string} The ID of the newly created instance.
 */
function addNewInstance({ commit, getters, rootState }, { actionId, client }) {
  const instanceId = String(lastInstanceId);
  lastInstanceId++;

  /** @type {ActionObject} */
  const action = getters.getActionById(actionId);
  const clientActionConfig = rootState.config.actions[action.id];
  commit('addNewInstance', {
    instanceId,
    Runner: action.Runner,
    client,
    config: clientActionConfig,
  });

  return instanceId;
}

/**
 * @typedef {Object.<string, string[]>} DependentInstancesByActionId
 */

/**
 * Gets all the instances that depend on each action.
 * @param {import('vuex').ActionContext} context
 * @param {string[]} instanceIds
 * @returns {DependentInstancesByActionId}
 */
function getDependentInstancesByActionId({ getters }, instanceIds) {
  const dependentInstancesByActionId = {};
  for (const instanceId of instanceIds) {
    /** @type {ActionInstanceData} */
    const instance = getters.getInstanceById(instanceId);
    /** @type {ActionObject} */
    const action = getters.getActionById(instance.actionId);
    if (action.requiredActions.length > 0) {
      for (const actionId of action.requiredActions) {
        if (!(actionId in dependentInstancesByActionId)) {
          dependentInstancesByActionId[actionId] = [];
        }
        dependentInstancesByActionId[actionId].push(instanceId);
      }
    }
  }
  return dependentInstancesByActionId;
}

/**
 * Checks if all the actions an action depends on have completed.
 * @param {ActionObject} action
 * @param {string[]} completedActionIds
 * @returns {boolean}
 */
function allDependentActionsCompleted(action, completedActionIds) {
  for (const actionId of action.requiredActions) {
    if (!completedActionIds.includes(actionId)) {
      return false;
    }
  }
  return true;
}

/**
 * @typedef {(instance: ActionInstanceData) => Promise<void>} ActionInstancePromise
 */

/**
 * Runs all the instances that depend on the provided action.
 * @param {import('vuex').ActionContext<State>} context
 * @param {Object} options
 * @param {string} options.actionId
 * @param {DependentInstancesByActionId} options.dependentInstancesByActionId
 * @param {string[]} options.completedActionIds
 * @param {ActionInstancePromise} options.getInstancePromise
 * @returns {Promise<void>}
 */
async function runDependentInstances({ getters }, {
  actionId,
  dependentInstancesByActionId,
  completedActionIds,
  getInstancePromise,
}) {
  /** The instances that depends on this action. */
  const instanceIds = dependentInstancesByActionId[actionId];
  const promises = [];
  for (const instanceId of instanceIds) {
    /** @type {ActionInstanceData} */
    const instance = getters.getInstanceById(instanceId);
    /** @type {ActionObject} */
    const action = getters.getActionById(instance.actionId);
    // Check if all the actions this instance depends on completed
    if (allDependentActionsCompleted(action, completedActionIds)) {
      // If they did, the instance can now be run.
      promises.push(getInstancePromise(instance));
    }
  }
  await Promise.all(promises);
}

/**
 * @type {Object.<string, ActionInstanceClass>}
 * Client action runner instances stored by instance ID.
 */
const instanceClasses = {};

/** @type {import('vuex').Module<State>} */
const vuexModule = {
  namespaced: true,
  state: {
    actions: {},
    instances: {},
    runs: [],
    currentRunId: null,
  },
  getters: {
    getActionById: state => id => state.actions[id],
    getInstanceById: state => id => state.instances[id],
    getRunById: state => id => state.runs[id],
    currentRun: state => state.runs[state.currentRunId],
    previousRun: state => state.runs[state.currentRunId - 1],
    /**
     * Gets the IDs of all the actions in the specified run.
     * @returns {(runId: string) => string[]} IDs of the actions in run.
     */
    getAllActionsInRun: (_state, getters) => (runId) => {
      /** @type {ActionRun} */
      const run = getters.getRunById(runId);
      return Object.keys(run.instancesByActionId);
    },
    /**
     * Gets all the browsers a particular action supports.
     * @returns {(id: string) => import('@/backend/constants').BrowserCode[]}
     */
    getBrowsersActionSupports: (_, getters) => (id) => {
      const action = getters.getActionById(id);
      const supportedBrowsers = [];
      for (const browserCode of Object.values(browserCodes)) {
        const featuresSupportedByBrowser = featuresSupportedByBrowsers[browserCode];
        let allSupported = true;
        for (const requiredFeature of action.requiredFeatures) {
          if (!featuresSupportedByBrowser.includes(requiredFeature)) {
            allSupported = false;
            break;
          }
        }
        if (allSupported) {
          supportedBrowsers.push(browserCode);
        }
      }
      return supportedBrowsers;
    },
    /**
     * Checks if an action supports the browser the extension is currently running in.
     * @returns {(id: string) => boolean}
     */
    actionSupportsCurrentBrowser: (_, getters) => (id) => {
      const action = getters.getActionById(id);
      const featuresSupportedByCurrentBrowser = featuresSupportedByBrowsers[getCurrentBrowser()];
      for (const requiredFeature of action.requiredFeatures) {
        if (!featuresSupportedByCurrentBrowser.includes(requiredFeature)) {
          return false;
        }
      }
      return true;
    },
    /**
     * Whether the extension is currently running some tasks.
     * @returns {boolean}
     */
    running: (_state, getters) => {
      /** @type {{currentRun: ActionRun}} */
      const { currentRun } = getters;
      if (currentRun) {
        return currentRun.running;
      }
      return false;
    },
    /**
     * Checks whether all instances of a particular action in a run have outputs.
     * @returns {(runId: string, actionId: string) => boolean}
     */
    actionHasOutput: (_state, getters) => (runId, actionId) => {
      const run = getters.getRunById(runId);
      if (run) {
        const instanceIds = run.instancesByActionId[actionId];
        if (instanceIds.length > 0) {
          for (const instanceId of instanceIds) {
            /** @type {ActionInstanceData} */
            const instance = getters.getInstanceById(instanceId);
            if (!instance.output) {
              return false;
            }
          }
          return true;
        }
      }
      return false;
    },
    /**
     * Gets all the action instances in a run that should be retried.
     * @returns {(runId: number) => ClientActionFailure[]}
     */
    getRetryableFailures: (_state, getters) => (runId) => {
      const failures = [];
      /** @type {ActionRun} */
      const run = getters.getRunById(runId);
      if (run) {
        for (const instanceIds of Object.values(run.instancesByActionId)) {
          for (const instanceId of instanceIds) {
            /** @type {ActionInstanceData} */
            const instance = getters.getInstanceById(instanceId);
            if (instance.shouldRetry) {
              failures.push({
                clientId: instance.client.id,
                actionId: instance.actionId,
                error: instance.retryReason,
              });
            }
          }
        }
      }
      return failures;
    },
    /**
     * All the failures that can be retried in a run grouped by client ID.
     * @returns {(runId: number) => ClientActionFailuresByClient}
     */
    getRetryableFailuresByClient: (_state, getters) => (runId) => {
      /** @type {ClientActionFailuresByClient} */
      const clientFailures = {};
      for (const failure of getters.getRetryableFailures(runId)) {
        const { clientId } = failure;
        if (!(clientId in clientFailures)) {
          clientFailures[clientId] = [];
        }
        clientFailures[clientId].push(failure);
      }
      return clientFailures;
    },
    /**
     * Gets all the clients from a run that should be retried.
     * @returns {(runId: number) => Client[]}
     */
    getClientsToRetry: (_state, getters) => (runId) => {
      const retryableFailuresByClient = getters.getRetryableFailuresByClient(runId);
      const clientIds = Object.keys(retryableFailuresByClient);
      return clientIds.map(id => getters.getClientFromRun(runId, id));
    },
    /**
     * Checks whether any failures from a run can be retried.
     * @returns {(runId: number) => boolean}
     */
    getAnyRetryableFailures(_state, getters) {
      return runId => getters.getRetryableFailures(runId).length > 0;
    },
    /**
     * Gets the IDs of all runs with retryable failures.
     * @returns {number[]}
     */
    runsWithFailures(state, getters) {
      const runIds = [];
      for (const runId of Object.keys(state.runs)) {
        if (getters.getAnyRetryableFailures(Number(runId))) {
          runIds.push(Number(runId));
        }
      }
      return runIds;
    },
    /**
     * Gets the instance that matches the provided run, action and client IDs.
     * @returns {(runId: number, actionId: string, clientId: number) => ActionInstanceData}
     */
    getInstance: (_state, getters) => (runId, actionId, clientId) => {
      /** @type {ActionRun} */
      const run = getters.getRunById(runId);
      if (run) {
        const instanceIds = run.instancesByActionId[actionId];
        for (const instanceId of instanceIds) {
          /** @type {ActionInstanceData} */
          const instance = getters.getInstanceById(instanceId);
          if (instance.client.id === clientId) {
            return instance;
          }
        }
      }
      return null;
    },
    /**
     * Gets the instance from the previous run that matches the provided one.
     * @returns {(instanceId: string) => ActionInstanceData}
     */
    getPreviousInstance: (state, getters) => (instanceId) => {
      /** @type {ActionInstanceData} */
      const instance = getters.getInstanceById(instanceId);
      return getters.getInstance(state.currentRunId - 1, instance.actionId, instance.client.id);
    },
    /**
     * Gets the outputs of all client action runner instances whose action IDs match the one
     * specified.
     * @returns {(runId: string, actionId: string) => ClientActionOutputs}
     */
    getOutputsOfAction: (_state, getters) => (runId, actionId) => {
      /** @type {ClientActionOutputs} */
      const outputs = {};
      /** @type {ActionRun} */
      const run = getters.getRunById(runId);
      if (run) {
        const instanceIds = run.instancesByActionId[actionId];
        for (const instanceId of instanceIds) {
          /** @type {ActionInstanceData} */
          const instance = getters.getInstanceById(instanceId);
          // TODO: Don't add so much to the output
          outputs[instance.client.id] = {
            actionId,
            clientId: instance.client.id,
            value: instance.output,
            error: instance.error,
          };
        }
      }
      return outputs;
    },
    /**
     * Finds a client in a run using a run and client ID.
     * @returns {(runId: number, clientId: (string|number)) => Client}
     */
    getClientFromRun: (_state, getters) => (runId, clientId) => {
      /** @type {ActionRun} */
      const run = getters.getRunById(runId);
      return run.clients.find(client => client.id === Number(clientId));
    },
    getDefaultActionInput: (_state, getters) => (actionId) => {
      /** @type {ActionObject} */
      const action = getters.getActionById(actionId);
      return action.defaultInput();
    },
  },
  mutations: {
    /**
     * Adds a new client action.
     * @param {ActionObject} payload
     */
    add(state, payload) {
      Vue.set(state.actions, payload.id, payload);
    },
    /**
     * Initializes a new program run. Each run can have different actions and outputs.
     * @see {@link ActionRun}
     * @param {Object} payload
     * @param {number} payload.taskId ID of the task associated with this run.
     * @param {Client[]} payload.clients
     */
    startNewRun(state, { taskId, clients }) {
      const runsLength = state.runs.push({
        instancesByActionId: {},
        taskId,
        running: true,
        clients,
      });
      const runId = runsLength - 1;
      state.currentRunId = runId;
    },
    /**
     * Sets a run's running status to false.
     * @param {number} runId
     */
    completeRun(state, runId) {
      state.runs[runId].running = false;
    },
    /**
     * Adds a newly created action runner instance to the current run.
     * @param {State} state
     * @param {Object} payload
     * @param {string} payload.instanceId
     * TODO: Find a better way to keep this constructor in sync with the actual runner constructor.
     * @param {new (id) => ActionInstanceClass} payload.Runner
     * @param {Client} payload.client
     * @param {Object} payload.config
     */
    addNewInstance(state, {
      instanceId,
      Runner,
      client,
      config,
    }) {
      // Create a place to store this instances' data.
      Vue.set(state.instances, instanceId, {});

      // Actually create the instance and store the class whose methods will be called.
      const instanceClass = new Runner(instanceId);
      instanceClasses[instanceId] = instanceClass;

      // Initialize the instance's data.
      instanceClass.init({ client, config });

      // Add the instance to the current run.
      const currentRun = state.runs[state.currentRunId];
      const { actionId } = state.instances[instanceId];
      if (!(actionId in currentRun.instancesByActionId)) {
        Vue.set(currentRun.instancesByActionId, actionId, []);
      }
      currentRun.instancesByActionId[actionId].push(instanceId);
    },
    /**
     * Changes a client action runner instance's data.
     * Used in ClientActionRunners to proxy the store.
     * @param {Object} payload
     * @param {string} payload.id ID of the instance.
     * @param {string} payload.prop Property to change.
     * @param {any} payload.value New value of the property.
     */
    setInstanceProperty(state, { id, prop, value }) {
      Vue.set(state.instances[id], prop, value);
    },
    /**
     * Sets a client action runner instance's error.
     * @param {Object} payload
     * @param {string} payload.id ID of the instance.
     * @param {any} payload.error
     */
    setInstanceError(state, { id, error }) {
      Vue.set(state.instances[id], 'error', error);
    },
    /**
     * Sets a client action runner instance's input.
     * @param {Object} payload
     * @param {string} payload.id ID of the instance.
     * @param {Object} payload.input
     */
    setInstanceInput(state, { id, input }) {
      Vue.set(state.instances[id], 'input', input);
    },
  },
  actions: {
    /**
     * Adds a new client action.
     * @param {VuexActionContext} context
     * @param {ActionObject} payload
     */
    async add({ commit }, payload) {
      commit('add', payload);
    },
    /**
     * Runs an action on a single client.
     * @param {VuexActionContext} context
     * @param {Object} payload
     * @param {string} payload.instanceId
     * @param {Object} payload.input Action input object.
     * @param {Client} payload.client
     * @param {import('@/transitional/tasks').TaskObject} payload.mainTask
     * @param {boolean} payload.isSingleAction
     * Whether this is the only action running on this client
     * @param {number} payload.loggedInTabId ID of the logged in tab.
     * @param {boolean} payload.retry If this run is just a retry of a previous one.
     */
    async runActionOnClient({ commit, getters }, {
      instanceId,
      input,
      client,
      mainTask,
      isSingleAction,
      loggedInTabId,
      retry,
    }) {
      /** @type {ActionInstanceData} */
      const instance = getters.getInstanceById(instanceId);
      /** @type {ActionObject} */
      const clientAction = getters.getActionById(instance.actionId);

      const task = await createTask(store, { title: clientAction.name, parent: mainTask.id });
      let taskHasError = false;
      try {
        await taskFunction({
          task,
          setState: false,
          async func() {
            if (!(clientAction.requiresTaxTypes && client.taxTypes === null)) {
              log.setCategory(clientAction.logCategory);

              if (retry) {
                /** @type {ActionInstanceData} */
                const prevInstance = getters.getPreviousInstance(instanceId);
                if (prevInstance.retryInput) {
                  // Make sure the last instance's original input is used as well as the input to
                  // retry the specific parts of the action that failed. For example, if a date
                  // range was specified the last time the action was run, make sure we use the same
                  // one when retrying.
                  const newInput = Object.assign(prevInstance.input, prevInstance.retryInput);
                  commit('setInstanceInput', { id: instanceId, input: newInput });
                }
              } else {
                commit('setInstanceInput', { id: instanceId, input });
              }

              /** @type {ActionInstanceClass} */
              const instanceClass = instanceClasses[instanceId];
              await instanceClass.run({
                task,
                loggedInTabId,
              });
              if (task.state === taskStates.ERROR) {
                taskHasError = true;
              }
            } else {
              // eslint-disable-next-line max-len
              throw new MissingTaxTypesError('Missing tax types. This was probably due to an error when retrieving them from the taxpayer profile.');
            }
          },
        });
      } catch (error) {
        log.setCategory(clientAction.logCategory);
        log.showError(error);
        if (isSingleAction) {
          // If this is the only action being run on this client,
          // show any errors produced by it on the main task.
          mainTask.setError(error);
        } else {
          taskHasError = true;
        }
        commit('setInstanceError', { id: instanceId, error });
      } finally {
        if (taskHasError) {
          if (isSingleAction) {
            // If this is the only action being run on this client,
            // show any errors produced by it on the main task.
            mainTask.state = taskStates.ERROR;
          } else {
            // Show a warning on the main task to indicate that one of the actions failed.
            mainTask.state = taskStates.WARNING;
          }
        }
      }
    },
    /**
     * Runs several actions in parallel on a single client.
     * @param {VuexActionContext} context
     * @param {Object} payload
     * @param {Client} payload.client
     * @param {string[]} payload.actionIds
     * @param {Object.<string, Object>} [payload.actionInputs] Inputs by action ID
     * @param {string[]} payload.instanceIds
     * @param {number} payload.parentTaskId
     * @param {boolean} payload.retry If this run is just a retry of a previous one.
     */
    async runActionsOnClient(context, {
      client,
      actionIds,
      actionInputs = {},
      instanceIds,
      parentTaskId,
      retry,
    }) {
      const {
        rootState, commit, getters, dispatch,
      } = context;
      const isSingleAction = actionIds.length === 1;
      let singleAction = null;

      const clientIdentifier = getClientIdentifier(client);
      let taskTitle = clientIdentifier;
      const anonymousClientIdentifier = getClientIdentifier(client, true);
      let anonymousTaskTitle = anonymousClientIdentifier;
      if (isSingleAction) {
        singleAction = getters.getActionById(actionIds[0]);
        // If there is only one action, include it's name in the task's name.
        taskTitle = `${clientIdentifier}: ${singleAction.name}`;
        anonymousTaskTitle = `${anonymousClientIdentifier}: ${singleAction.name}`;
      }

      const mainTask = await createTask(store, {
        title: taskTitle,
        anonymousTitle: anonymousTaskTitle,
        unknownMaxProgress: false,
        progressMax: 2 + actionIds.length,
        sequential: isSingleAction,
        parent: parentTaskId,
      });

      /** @type {ActionObject[]} */
      const actions = actionIds.map(id => getters.getActionById(id));

      let loggedInTabId = null;
      let anyActionsNeedLoggedInTab = false;
      // TODO: Reduce complexity. Move some of it into separate functions, it's hard to read.
      try {
        await taskFunction({
          task: mainTask,
          setState: false,
          async func() {
            try {
              try {
                // Check if any of the actions require something
                const actionsThatRequire = {
                  loggedInTab: [],
                  taxTypes: [],
                };
                for (const action of actions) {
                  if (action.usesLoggedInTab) {
                    actionsThatRequire.loggedInTab.push(action.id);
                  }
                  if (action.requiresTaxTypes) {
                    actionsThatRequire.taxTypes.push(action.id);
                  }
                }

                anyActionsNeedLoggedInTab = actionsThatRequire.loggedInTab.length > 0;
                const anyActionsRequireTaxTypes = actionsThatRequire.taxTypes.length > 0;

                // If any actions require tax types, an extra task will be added to retrieve them.
                if (anyActionsRequireTaxTypes) {
                  mainTask.progressMax += 1;
                }

                mainTask.status = 'Logging in';
                loggedInTabId = await robustLogin({
                  client,
                  parentTaskId: mainTask.id,
                  maxAttempts: rootState.config.maxLoginAttempts,
                  keepTabOpen: anyActionsNeedLoggedInTab,
                });

                // Get tax types if any actions require them
                if (anyActionsRequireTaxTypes) {
                  mainTask.status = 'Getting tax account details';
                  try {
                    await dispatch('clients/getTaxAccounts', {
                      id: client.id,
                      parentTaskId: mainTask.id,
                    }, { root: true });
                  } catch (error) {
                    // if all actions require tax types
                    if (actionsThatRequire.taxTypes.length === actionIds.length) {
                      throw error;
                    } else {
                      // Ignore error if not all tasks require tax types
                    }
                  }
                }

                /**
                 * Creates a promise that will actually run an instance.
                 * @param {ActionInstanceData} instance
                 * @returns {Promise<void>}
                 */
                /* eslint-disable no-inner-declarations */
                function getInstancePromise(instance) {
                  return dispatch('runActionOnClient', {
                    instanceId: instance.id,
                    input: instance.actionId in actionInputs ? actionInputs[instance.actionId] : {},
                    client,
                    mainTask,
                    isSingleAction,
                    loggedInTabId,
                    retry,
                  });
                }

                // FIXME: Allow for multiple instances of the same action.
                const dependentInstancesByActionId = getDependentInstancesByActionId(
                  context,
                  instanceIds,
                );

                const completedActionIds = [];

                /**
                 * Gets a promise that runs the provided instance as well as any instances
                 * that depend on it.
                 * @param {ActionObject} action
                 * @param {ActionInstanceData} instance
                 * @returns {Promise<void>}
                 */
                async function getInstanceWithDependentsPromise(action, instance) {
                  await getInstancePromise(instance);
                  completedActionIds.push(action.id);
                  await runDependentInstances(context, {
                    actionId: action.id,
                    completedActionIds,
                    getInstancePromise,
                    dependentInstancesByActionId,
                  });
                }
                /* eslint-enable no-inner-declarations */

                // Run actions in parallel
                if (!isSingleAction) {
                  mainTask.status = 'Running actions';
                } else {
                  mainTask.status = singleAction.name;
                }
                const promises = [];
                for (const instanceId of instanceIds) {
                  /** @type {ActionInstanceData} */
                  const instance = getters.getInstanceById(instanceId);
                  /** @type {ActionObject} */
                  const action = getters.getActionById(instance.actionId);
                  if (action.requiredActions.length === 0) {
                    promises.push(getInstanceWithDependentsPromise(action, instance));
                  }
                }

                await Promise.all(promises);
              } catch (error) {
                for (const instanceId of instanceIds) {
                  commit('setInstanceError', { id: instanceId, error });
                }
                throw error;
              } finally {
                for (const instanceId of instanceIds) {
                  instanceClasses[instanceId].checkIfShouldRetry();
                }
              }

              mainTask.status = 'Logging out';
              await logout({ parentTaskId: mainTask.id });

              if (mainTask.state !== taskStates.ERROR && mainTask.state !== taskStates.WARNING) {
                if (mainTask.childStateCounts[taskStates.WARNING] > 0) {
                  mainTask.state = taskStates.WARNING;
                } else {
                  mainTask.state = taskStates.SUCCESS;
                }
              }
            } finally {
              if (anyActionsNeedLoggedInTab) {
                // TODO: Catch tab close errors
                closeTab(loggedInTabId);
              }
            }
          },
        });
      } catch (error) {
        log.setCategory(clientIdentifier);
        log.showError(error);
      }
    },
    /**
     * @callback GetClientsActionIds Gets the IDs of the actions to run on a client.
     * @param {Client} client
     * @return {string[]} The IDs of the actions
     */
    /**
     * Main program that runs actions on clients. The actions to run are decided on a per-client
     * basis using the `getClientsActionIds` parameter.
     *
     * A root task is wrapped around each client and a notification is sent once all are complete.
     * @param {VuexActionContext} context
     * @param {Object} payload
     * @param {Client[]} payload.clients
     * @param {GetClientsActionIds} payload.getClientsActionIds
     * Function that decides the actions to run on each client.
     * @param {Object.<string, Object>} [payload.actionInputs] Inputs by action ID
     * @param {boolean} [payload.retry] If this run is just a retry of a previous one.
     */
    async run(context, {
      clients,
      getClientsActionIds,
      actionInputs = {},
      retry = false,
    }) {
      const {
        state,
        rootState,
        getters,
        commit,
        dispatch,
      } = context;
      /** Just the valid clients. */
      const validClients = clients.filter(client => client.valid);
      if (validClients.length > 0) {
        if (rootState.config.zraLiteMode) {
          dispatch('setZraLiteMode', true, { root: true });
        }

        const rootTask = await createTask(store, {
          title: 'Run actions on clients',
          progressMax: validClients.length,
          unknownMaxProgress: false,
          sequential: true,
          isRoot: true,
          list: 'clientActions',
        });

        commit('startNewRun', { taskId: rootTask.id, clients });
        rootTask.title += ` #${state.currentRunId + 1}`;
        rootTask.anonymousTitle = rootTask.title;
        try {
          await taskFunction({
            task: rootTask,
            catchErrors: true,
            setStateBasedOnChildren: true,
            async func() {
              /* eslint-disable no-await-in-loop */
              for (const client of validClients) {
                const originalActionIds = getClientsActionIds(client);
                const actionIds = [];
                // Add any action dependencies
                for (const actionId of originalActionIds) {
                  /** @type {ActionObject} */
                  const action = getters.getActionById(actionId);
                  // TODO: Tag dependent actions as such.
                  for (const dependentActionId of action.requiredActions) {
                    if (!actionIds.includes(dependentActionId)) {
                      actionIds.push(dependentActionId);
                    }
                  }
                  actionIds.push(actionId);
                }

                // Initialize all client action runner instances.
                const instanceIds = actionIds.map(
                  actionId => addNewInstance(context, { actionId, client }),
                );

                rootTask.status = client.name;
                // TODO: Consider checking if a tab has been closed prematurely all the time.
                // Currently, only tabLoaded checks for this.
                await dispatch('runActionsOnClient', {
                  client,
                  actionIds,
                  actionInputs,
                  instanceIds,
                  parentTaskId: rootTask.id,
                  retry,
                });
              }
              /* eslint-enable no-await-in-loop */
            },
          });
        } finally {
          if (rootState.config.sendNotifications) {
            notify({
              title: 'All tasks complete',
              message: `Finished running ${validClients.length} client(s)`,
            });
          }
          commit('completeRun', state.currentRunId);
          if (rootState.config.zraLiteMode) {
            dispatch('setZraLiteMode', false, { root: true });
          }
        }
      } else {
        log.setCategory('clientAction');
        log.showError('No clients found');
      }
    },
    /**
     * Runs the passed actions on all clients.
     * @param {VuexActionContext} context
     * @param {Object} payload
     * @param {number[]} payload.actionIds
     * @param {number[]} payload.clientIds
     * @param {Object.<string, Object>} payload.actionInputs Inputs by action ID
     */
    async runSelectedActionsOnAllClients(
      { dispatch, rootGetters },
      { actionIds, clientIds, actionInputs },
    ) {
      /** All clients including the invalid ones. */
      const clients = clientIds.map(id => rootGetters['clients/getClientById'](id));
      await dispatch('run', {
        clients,
        getClientsActionIds: () => actionIds,
        actionInputs,
      });
    },
    /**
     * Re-runs all the actions that failed on the clients they failed on.
     * @param {VuexActionContext} context
     * @param {{runId: number}} payload
     */
    async retryFailures({ getters, dispatch }, { runId }) {
      const clients = getters.getClientsToRetry(runId);
      const retryableFailuresByClient = getters.getRetryableFailuresByClient(runId);
      await dispatch('run', {
        clients,
        // TODO: Consider getting action IDs within 'run' itself.
        getClientsActionIds(client) {
          return retryableFailuresByClient[client.id].map(failure => failure.actionId);
        },
        retry: true,
      });
    },
  },
};
export default vuexModule;
