import Vue from 'vue';
import store from '@/store';
import log from '@/transitional/log';
import createTask from '@/transitional/tasks';
import { TaskState } from '@/store/modules/tasks';
import { MissingTaxTypesError } from '@/backend/errors';
import { robustLogin, logout } from '@/backend/client_actions/user';
import { featuresSupportedByBrowsers, BrowserCode, Client } from '@/backend/constants';
import { getCurrentBrowser } from '@/utils';
import notify from '@/backend/notify';
import { closeTab } from '@/backend/utils';
import { taskFunction, getClientIdentifier } from '@/backend/client_actions/utils';
import { Module, ActionContext } from 'vuex';
import { RootState } from '@/store/types';
import {
  ClientActions,
  ClientActionOutput,
  ClientActionOutputs,
  ActionRun,
  ClientActionFailure,
  ClientActionFailuresByClient,
  ClientActionInstanceClass,
  ClientActionInstanceData,
} from './types';

type VuexActionContext = ActionContext<RootState, ClientActions.State>

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

  /** @type {ClientActionObject} */
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
 * Sets action instances' inputs to the ones provided by the user.
 *
 * If the run is a retry, the inputs are retrieved from each instances corresponding retry
 * instance. Additionally, the outputs of the previous runs instances are added to the current ones.
 * @param {import('vuex').ActionContext} context
 * @param {Object} options
 * @param {ClientActionInstanceData[]} options.instances
 * @param {Object.<string, Object>} options.actionInputs Inputs by action ID
 * @param {boolean} options.retry If this run is just a retry of a previous one.
 * @param {number} options.retryRunId ID of the run that is being retried
 */
function initializeInstances({ commit, getters }, {
  instances,
  actionInputs,
  retry,
  retryRunId,
}) {
  for (const instance of instances) {
    let input = null;
    if (instance.actionId in actionInputs) {
      input = actionInputs[instance.actionId];
    }

    if (retry) {
      /** @type {ClientActionInstanceData} */
      const retryInstance = getters.getInstance(
        retryRunId, instance.actionId, instance.client.id,
      );
      // Make sure `retryInput` exists even if as an empty object
      if (retryInstance.retryInput) {
        // Make sure the last instance's original input is used as well as the input to
        // retry the specific parts of the action that failed. For example, if a date
        // range was specified the last time the action was run, make sure we use the same
        // one when retrying.
        let newInput = Object.assign({}, retryInstance.input);
        newInput = Object.assign(newInput, retryInstance.retryInput);
        commit('setInstanceInput', { id: instance.id, input: newInput });
        commit('setInstancePreviousOutput', { id: instance.id, output: retryInstance.output });
      }
    } else if (input !== null) {
      commit('setInstanceInput', { id: instance.id, input });
    }
  }
}

/**
 * @typedef {Object.<string, string[]>} DependentInstances
 * Dependent instances grouped by the instance they depend on.
 */

/**
 * Gets all the instances that depend on each provided instance.
 * @param {import('vuex').ActionContext} context
 * @param {string[]} instanceIds
 * @returns {DependentInstances}
 */
function getDependentInstances({ getters }, instanceIds) {
  const dependentInstances = {};
  for (const instanceId of instanceIds) {
    /** @type {ClientActionInstanceData} */
    const instance = getters.getInstanceById(instanceId);
    for (const dependedInstanceId of instance.dependencies) {
      if (!(dependedInstanceId in dependentInstances)) {
        dependentInstances[dependedInstanceId] = [];
      }
      dependentInstances[dependedInstanceId].push(instanceId);
    }
  }
  return dependentInstances;
}

/**
 * Checks if all the instances an instance depends on have completed.
 * @param {ClientActionInstanceData} instance
 * @param {string[]} completedInstanceIds
 * @returns {boolean}
 */
function allDependedInstancesCompleted(instance, completedInstanceIds) {
  for (const instanceId of instance.dependencies) {
    if (!completedInstanceIds.includes(instanceId)) {
      return false;
    }
  }
  return true;
}

/**
 * @typedef {(instance: ActionInstanceData) => Promise<void>} ActionInstancePromise
 */

/**
 * Runs all the instances that depend on the provided instance.
 * @param {import('vuex').ActionContext<State>} context
 * @param {Object} options
 * @param {ClientActionInstanceData} options.instance
 * @param {DependentInstances} options.dependentInstances
 * @param {string[]} options.completedInstanceIds
 * @param {ActionInstancePromise} options.getInstancePromise
 * @returns {Promise<void>}
 */
async function runDependentInstances({ getters }, {
  instance: parentInstance,
  dependentInstances,
  completedInstanceIds,
  getInstancePromise,
}) {
  if (parentInstance.id in dependentInstances) {
    /** The instances that depends on this instance. */
    const instanceIds = dependentInstances[parentInstance.id];
    const promises = [];
    for (const instanceId of instanceIds) {
      /** @type {ClientActionInstanceData} */
      const instance = getters.getInstanceById(instanceId);
      // Check if all the instances this instance depends on completed
      if (allDependedInstancesCompleted(instance, completedInstanceIds)) {
        // If they did, the instance can now be run.
        promises.push(getInstancePromise(instance));
      }
    }
    await Promise.all(promises);
  }
}

/**
 * Recursively get instances of dependent actions.
 * @param {import('vuex').ActionContext} context
 * @param {Object} options
 * @param {Client} options.client
 * @param {string[]} options.requiredActions
 * @param {ClientActionInstanceData[]} options.instances
 * @param {string} options.parentInstanceId The ID of the instance that `requiredActions` belong to.
 * @returns {ClientActionInstanceData[]}
 */
// TODO: Make this less confusing
function getDependedActionInstances(context, {
  client,
  requiredActions,
  instances: instancesParam,
  parentInstanceId,
}) {
  let instances = instancesParam.slice();
  const { commit, getters } = context;
  for (const dependedActionId of requiredActions) {
    const existingInstance = instances.find(instance => instance.actionId === dependedActionId);
    let dependedInstanceId;
    if (!existingInstance) {
      dependedInstanceId = addNewInstance(context, {
        actionId: dependedActionId,
        client,
      });
      /** @type {ClientActionInstanceData} */
      const dependedInstance = getters.getInstanceById(dependedInstanceId);
      /** @type {ClientActionObject} */
      const action = getters.getActionById(dependedInstance.actionId);
      instances.push(dependedInstance);
      instances = getDependedActionInstances(context, {
        client,
        requiredActions: action.requiredActions,
        instances,
        parentInstanceId: dependedInstanceId,
      });
    } else {
      dependedInstanceId = existingInstance.id;
    }

    // Add this depended instance to the list of instance's instance dependencies.
    commit('addDependedInstanceToInstance', {
      id: parentInstanceId,
      dependedInstanceId,
    });
  }
  return instances;
}

/**
 * Creates instances from actions as well as any dependent instances.
 * @param {import('vuex').ActionContext} context
 * @param {string[]} actionIds
 * @param {Client} client
 * @returns {ClientActionInstanceData[]}
 */
// TODO: Make this less confusing
function convertActionsToInstances(context, actionIds, client) {
  const { getters } = context;
  /** @type {ClientActionInstanceData[]} */
  let instances = [];
  for (const actionId of actionIds) {
    const instanceId = addNewInstance(context, { actionId, client });
    /** @type {ClientActionInstanceData} */
    const instance = getters.getInstanceById(instanceId);
    instances.push(instance);
    /** @type {ClientActionObject} */
    const action = getters.getActionById(actionId);
    instances = getDependedActionInstances(context, {
      client,
      requiredActions: action.requiredActions,
      instances,
      parentInstanceId: instanceId,
    });
  }
  return instances;
}

/** Client action runner instances stored by instance ID. */
const instanceClasses: { [instanceId: string]: ClientActionInstanceClass } = {};

/**
 * @param {string|number} instanceId
 * @returns {ActionInstanceClass}
 */
export function getInstanceClassById(instanceId) {
  return instanceClasses[instanceId];
}

const vuexModule: Module<ClientActions.State, RootState> = {
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
      for (const browserCode of Object.values(BrowserCode)) {
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
            /** @type {ClientActionInstanceData} */
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
            /** @type {ClientActionInstanceData} */
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
     * @returns {(runId: number, actionId: string, clientId: number) => ClientActionInstanceData}
     */
    getInstance: (_state, getters) => (runId, actionId, clientId) => {
      /** @type {ActionRun} */
      const run = getters.getRunById(runId);
      if (run) {
        const instanceIds = run.instancesByActionId[actionId];
        for (const instanceId of instanceIds) {
          /** @type {ClientActionInstanceData} */
          const instance = getters.getInstanceById(instanceId);
          if (instance.client.id === clientId) {
            return instance;
          }
        }
      }
      return null;
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
          /** @type {ClientActionInstanceData} */
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
      /** @type {ClientActionObject} */
      const action = getters.getActionById(actionId);
      return action.defaultInput();
    },
  },
  mutations: {
    /**
     * Adds a new client action.
     * @param {ClientActionObject} payload
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
     * @param {Client[]} payload.allClients
     */
    startNewRun(state, {
      taskId,
      clients,
      allClients,
    }) {
      const runsLength = state.runs.push({
        instancesByActionId: {},
        taskId,
        running: true,
        clients,
        allClients,
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
     * @param {ClientActions.State} state
     * @param {Object} payload
     * @param {string} payload.instanceId
     * TODO: Find a better way to keep this constructor in sync with the actual runner constructor.
     * @param {new () => ClientActionInstanceClass} payload.Runner
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
      const instanceClass = new Runner();
      instanceClass.create(instanceId);
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
    setInstancePreviousOutput(state, { id, output }) {
      state.instances[id].allRunOutputs.unshift(output);
    },
    addDependedInstanceToInstance(state, { id, dependedInstanceId }) {
      state.instances[id].dependencies.push(dependedInstanceId);
    },
  },
  actions: {
    /**
     * Adds a new client action.
     * @param {VuexActionContext} context
     * @param {ClientActionObject} payload
     */
    async add({ commit }, payload) {
      commit('add', payload);
    },
    /**
     * Runs an action on a single client.
     * @param {VuexActionContext} context
     * @param {Object} payload
     * @param {string} payload.instanceId
     * @param {Client} payload.client
     * @param {import('@/transitional/tasks').TaskObject} payload.mainTask
     * @param {boolean} payload.isSingleAction
     * Whether this is the only action running on this client
     * @param {number} payload.loggedInTabId ID of the logged in tab.
     */
    async runActionOnClient({ commit, getters }, {
      instanceId,
      client,
      mainTask,
      isSingleAction,
      loggedInTabId,
    }) {
      /** @type {ClientActionInstanceData} */
      const instance = getters.getInstanceById(instanceId);
      /** @type {ClientActionObject} */
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

              /** @type {ClientActionInstanceClass} */
              const instanceClass = getInstanceClassById(instanceId);
              await instanceClass.run({
                task,
                loggedInTabId,
              });
              if (task.state === TaskState.ERROR) {
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
            mainTask.state = TaskState.ERROR;
          } else {
            // Show a warning on the main task to indicate that one of the actions failed.
            mainTask.state = TaskState.WARNING;
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
     * @param {string[]} payload.instanceIds
     * @param {number} payload.parentTaskId
     */
    // TODO: Use instance IDs only
    async runActionsOnClient(context, {
      client,
      actionIds,
      instanceIds,
      parentTaskId,
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

      /** @type {ClientActionObject[]} */
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
                 * @param {ClientActionInstanceData} instance
                 * @returns {Promise<void>}
                 */
                /* eslint-disable no-inner-declarations */
                function getInstancePromise(instance) {
                  return dispatch('runActionOnClient', {
                    instanceId: instance.id,
                    client,
                    mainTask,
                    isSingleAction,
                    loggedInTabId,
                  });
                }

                // FIXME: Allow for multiple instances of the same action.
                const dependentInstances = getDependentInstances(context, instanceIds);

                const completedInstanceIds = [];

                /**
                 * Gets a promise that runs the provided instance as well as any instances
                 * that depend on it.
                 * @param {ClientActionInstanceData} instance
                 * @returns {Promise<void>}
                 */
                async function getInstanceWithDependentsPromise(instance) {
                  await getInstancePromise(instance);
                  completedInstanceIds.push(instance.id);
                  await runDependentInstances(context, {
                    instance,
                    dependentInstances,
                    completedInstanceIds,
                    getInstancePromise: getInstanceWithDependentsPromise,
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
                  /** @type {ClientActionInstanceData} */
                  const instance = getters.getInstanceById(instanceId);
                  // Run the instances that don't depend on any other ones first.
                  if (instance.dependencies.length === 0) {
                    promises.push(getInstanceWithDependentsPromise(instance));
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
                  /** @type {ActionInstanceClass} */
                  const instanceClass = getInstanceClassById(instanceId);
                  instanceClass.checkIfShouldRetry();
                  // Outputs must be merged here so it happens even if logging in failed
                  instanceClass.mergeAllRunOutputs();
                }
              }

              mainTask.status = 'Logging out';
              await logout({ parentTaskId: mainTask.id });

              if (mainTask.state !== TaskState.ERROR && mainTask.state !== TaskState.WARNING) {
                if (mainTask.childStateCounts[TaskState.WARNING] > 0) {
                  mainTask.state = TaskState.WARNING;
                } else {
                  mainTask.state = TaskState.SUCCESS;
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
     * @param {Client[]} payload.clients The clients that the actions should be run on.
     * @param {Client[]} [payload.allClients] All the clients in the client list.
     * @param {GetClientsActionIds} payload.getClientsActionIds
     * Function that decides the actions to run on each client.
     * @param {Object.<string, Object>} [payload.actionInputs] Inputs by action ID
     * @param {boolean} [payload.retry] If this run is just a retry of a previous one.
     * @param {number} [payload.retryRunId] ID of the run that is being retried
     */
    async run(context, {
      clients,
      allClients = clients.slice(),
      getClientsActionIds,
      actionInputs = {},
      retry = false,
      retryRunId = null,
    }) {
      const {
        state,
        rootState,
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

        commit('startNewRun', {
          taskId: rootTask.id,
          clients: validClients,
          allClients,
        });
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
                const actionIds = getClientsActionIds(client);
                const instances = convertActionsToInstances(context, actionIds, client);
                initializeInstances(context, {
                  instances,
                  actionInputs,
                  retry,
                  retryRunId,
                });

                rootTask.status = client.name;
                // TODO: Consider checking if a tab has been closed prematurely all the time.
                // Currently, only tabLoaded checks for this.
                await dispatch('runActionsOnClient', {
                  client,
                  actionIds: instances.map(instance => instance.actionId),
                  actionInputs,
                  instanceIds: instances.map(instance => instance.id),
                  parentTaskId: rootTask.id,
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
     * @param {number[]} payload.allClientIds
     * @param {Object.<string, Object>} payload.actionInputs Inputs by action ID
     */
    async runSelectedActionsOnAllClients(
      { dispatch, rootGetters },
      {
        actionIds,
        clientIds,
        allClientIds,
        actionInputs,
      },
    ) {
      const getClientById = rootGetters['clients/getClientById'];
      /** All selected clients including the invalid ones. */
      const clients = clientIds.map(id => getClientById(id));
      /** All clients including the invalid ones. */
      const allClients = allClientIds.map(id => getClientById(id));
      await dispatch('run', {
        clients,
        allClients,
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
        retryRunId: runId,
      });
    },
  },
};
export default vuexModule;
