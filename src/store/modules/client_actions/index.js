import Vue from 'vue';
import store from '@/store';
import log from '@/transitional/log';
import createTask from '@/transitional/tasks';
import { taskStates } from '@/store/modules/tasks';
import { MissingTaxTypesError } from '@/backend/errors';
import { robustLogin, logout } from '@/backend/client_actions/user';
import { featuresSupportedByBrowsers, browserCodes, exportFormatCodes } from '@/backend/constants';
import { getCurrentBrowser, objectHasProperties, joinSpecialLast } from '@/utils';
import notify from '@/backend/notify';
import { closeTab } from '@/backend/utils';

/**
 * @typedef {import('vuex').ActionContext} ActionContext
 * @typedef {import('@/backend/constants').Client} Client
 * @typedef {import('@/backend/constants').ClientActionObject} ClientActionObject
 */

/**
 * @typedef {Object} ClientActionState.Temp
 * @property {string} logCategory The log category to use when logging anything in this action.
 * @property {string[]} outputs IDs of this action's outputs.
 */

/** @typedef {ClientActionObject & ClientActionState.Temp} ClientActionState */

/**
 * @typedef {Object} ClientActionOutput
 * @property {ClientActionId} actionId
 * @property {string} clientId
 * @property {Object} [value]
 * @property {Error|null} [error]
 * If there was an error when getting the client's output, this will bet set.
 */

/**
 * @typedef {string} ClientUsername
 * @typedef {string} ClientActionId
 * @typedef {Object.<ClientActionId, ClientActionOutput>} ClientActionOutputs
 */

/**
 * @typedef {Object} ClientActionFailure
 * @property {number} clientId
 * @property {number} actionId
 */

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

// TODO: Document state and actions
/** @type {import('vuex').Module} */
const module = {
  namespaced: true,
  state: {
    /** @type {Object.<ClientActionId, ClientActionState>} */
    all: {},
    /** @type {ClientActionOutputs} */
    outputs: {},
    /** @type {ClientActionFailure[]} Actions that failed during the last run by client. */
    failures: [],
  },
  getters: {
    getActionById: state => id => state.all[id],
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
    running: (state, getters, rootState, rootGetters) => {
      const rootTask = rootGetters['tasks/rootTask'];
      if (rootTask) {
        return !rootTask.complete;
      }
      return false;
    },
    failuresByClient(state) {
      const clientFailures = {};
      for (const { clientId, actionId } of state.failures) {
        if (!(clientId in clientFailures)) {
          clientFailures[clientId] = [];
        }
        clientFailures[clientId].push(actionId);
      }
      return clientFailures;
    },
    anyFailed(state) {
      return state.failures.length > 0;
    },
  },
  mutations: {
    /**
     * Adds a new client action.
     * @param {any} state
     * @param {ClientActionObject} payload
     */
    add(state, payload) {
      const actualPayload = Object.assign({
        hasOutput: false,
        usesLoggedInTab: false,
        requiresTaxTypes: false,
        // TODO: Consider letting this be set by a parameter
        logCategory: payload.id,
        outputs: [],
        requiredFeatures: [],
      }, payload);
      if (actualPayload.requiresTaxTypes) {
        // A logged in tab is required to get tax types
        actualPayload.usesLoggedInTab = true;
      }

      validateActionOptions(actualPayload);

      Vue.set(state.all, payload.id, actualPayload);
    },
    /**
     * Sets the output of a client of a client action.
     * @param {any} state
     * @param {ClientActionOutput} payload
     */
    setOutput(state, {
      actionId, clientId, value, error = null,
    }) {
      const outputId = actionId + clientId;
      Vue.set(state.outputs, outputId, {
        actionId,
        clientId,
        value,
        error,
      });
      state.all[actionId].outputs.push(outputId);
    },
    resetFailures(state) {
      state.failures = [];
    },
    /**
     * @param {any} state
     * @param {ClientActionFailure} failure
     */
    addFailure(state, failure) {
      state.failures.push(failure);
    },
  },
  actions: {
    // TODO: Refer to action IDs as the same thing throughout
    /**
     * Adds a new client action.
     * @param {ActionContext} context
     * @param {ClientActionObject} payload
     */
    async add({ commit }, payload) {
      commit('add', payload);
    },

    /**
     * Runs an action on a single client.
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {ClientActionId} payload.actionId
     * @param {Client} payload.client
     * @param {import('@/transitional/tasks').TaskObject} payload.mainTask
     * @param {boolean} payload.isSingleAction
     * Whether this is the only action running on this client
     * @param {number} payload.loggedInTabId ID of the logged in tab.
     */
    async runActionOnClient(
      {
        rootState,
        getters,
        commit,
      },
      {
        actionId,
        client,
        mainTask,
        isSingleAction,
        loggedInTabId,
      },
    ) {
      /** @type {ClientActionState} */
      const clientAction = getters.getActionById(actionId);
      const clientActionConfig = rootState.config.actions[actionId];

      const task = await createTask(store, { title: clientAction.name, parent: mainTask.id });
      let taskHasError = false;
      try {
        if (!(clientAction.requiresTaxTypes && client.taxTypes === null)) {
          if (clientAction.func) {
            log.setCategory(clientAction.logCategory);

            const output = await clientAction.func({
              client,
              parentTask: task,
              clientActionConfig,
              loggedInTabId,
            });
            commit('setOutput', { actionId, clientId: client.id, value: output });
            if (task.state === taskStates.ERROR) {
              taskHasError = true;
            }
          } else {
            task.state = taskStates.SUCCESS;
          }
        } else {
          // eslint-disable-next-line max-len
          throw new MissingTaxTypesError('Missing tax types. This was probably due to an error when retrieving them from the taxpayer profile.');
        }
      } catch (error) {
        log.setCategory(clientAction.logCategory);
        log.showError(error);
        task.setError(error);
        if (isSingleAction) {
          // If this is the only action being run on this client,
          // show any errors produced by it on the main task.
          mainTask.setError(error);
        } else {
          taskHasError = true;
        }
        commit('setOutput', { actionId, clientId: client.id, error });
      } finally {
        task.markAsComplete();
        if (taskHasError) {
          if (isSingleAction) {
            // If this is the only action being run on this client,
            // show any errors produced by it on the main task.
            mainTask.state = taskStates.ERROR;
          } else {
            // Show a warning on the main task to indicate that one of the actions failed.
            mainTask.state = taskStates.WARNING;
          }
          commit('addFailure', { clientId: client.id, actionId });
        }
      }
    },
    /**
     * Runs several actions in parallel on a single client.
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {Client} payload.client
     * @param {ClientActionId[]} payload.actionIds
     * @param {number} payload.parentTaskId
     */
    async runActionsOnClient({
      rootState, commit, getters, dispatch,
    }, { client, actionIds, parentTaskId }) {
      const isSingleAction = actionIds.length === 1;
      let singleAction = null;
      const clientIdentifier = client.name ? client.name : `Client ${client.id}`;
      let taskTitle = clientIdentifier;
      // If there is only one action, include it's name in the task's name.
      if (isSingleAction) {
        singleAction = getters.getActionById(actionIds[0]);
        taskTitle = `${clientIdentifier}: ${singleAction.name}`;
      }
      const mainTask = await createTask(store, {
        title: taskTitle,
        unknownMaxProgress: false,
        progressMax: 2 + actionIds.length,
        sequential: isSingleAction,
        parent: parentTaskId,
      });
      let loggedInTabId = null;
      let loggedOut = false;
      let anyActionsNeedLoggedInTab = false;
      try {
        // Check if any of the actions require something
        const actionsThatRequire = {
          loggedInTab: [],
          taxTypes: [],
        };
        for (const actionId of actionIds) {
          const clientAction = getters.getActionById(actionId);
          if (clientAction.usesLoggedInTab) {
            actionsThatRequire.loggedInTab.push(actionId);
          }
          if (clientAction.requiresTaxTypes) {
            actionsThatRequire.taxTypes.push(actionId);
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
          mainTask.status = 'Getting tax types';
          try {
            await dispatch('clients/getTaxTypes', {
              id: client.id,
              parentTaskId: mainTask.id,
              loggedInTabId,
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

        // Run actions in parallel
        if (!isSingleAction) {
          mainTask.status = 'Running actions';
        } else {
          mainTask.status = singleAction.name;
        }
        const promises = [];
        for (const actionId of actionIds) {
          promises.push(dispatch('runActionOnClient', {
            actionId,
            client,
            mainTask,
            isSingleAction,
            loggedInTabId,
          }));
        }
        await Promise.all(promises);

        mainTask.status = 'Logging out';
        await logout({
          parentTaskId: mainTask.id,
          loggedInTabId: anyActionsNeedLoggedInTab ? loggedInTabId : null,
        });
        loggedOut = true;

        if (mainTask.state !== taskStates.ERROR && mainTask.state !== taskStates.WARNING) {
          if (mainTask.childStateCounts[taskStates.WARNING] > 0) {
            mainTask.state = taskStates.WARNING;
          } else {
            mainTask.state = taskStates.SUCCESS;
          }
        }
      } catch (error) {
        // If an action asked to keep the logged in tab open and logout didn't complete
        // then the tab still needs to be closed.
        if (anyActionsNeedLoggedInTab && !loggedOut && loggedInTabId !== null) {
          // TODO: Catch tab close errors
          closeTab(loggedInTabId);
        }
        log.setCategory(clientIdentifier);
        log.showError(error);
        mainTask.setError(error);
        for (const actionId of actionIds) {
          commit('setOutput', { actionId, clientId: client.id, error });
          commit('addFailure', { clientId: client.id, actionId });
        }
      } finally {
        mainTask.markAsComplete();
      }
    },
    /**
     * @callback GetClientsActionIds Gets the IDs of the actions to run on a client.
     * @param {Client} client
     * @return {number[]} The IDs of the actions
     */
    /**
     * Main program that runs actions on clients. The actions to run are decided on a per-client
     * basis using the `getClientsActionIds` parameter.
     *
     * A root task is wrapped around each client and a notification is sent once all are complete.
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {ClientActionId[]} payload.actionIds
     * @param {number[]} payload.clientIds
     * @param {GetClientsActionIds} payload.getClientsActionIds
     * Function that decides the actions to run on each client.
     */
    async run({
      rootState,
      rootGetters,
      commit,
      dispatch,
    }, {
      clientIds,
      getClientsActionIds,
    }) {
      const clients = clientIds.map(id => rootGetters['clients/getClientById'](id));
      if (clients.length > 0) {
        // Prepare for this run
        commit('resetFailures');

        const rootTask = await createTask(store, {
          title: 'Run actions on clients',
          progressMax: clients.length,
          unknownMaxProgress: false,
          sequential: true,
        });
        await dispatch('tasks/setRootTask', rootTask.id, { root: true });
        try {
          /* eslint-disable no-await-in-loop */
          for (const client of clients) {
            rootTask.status = client.name;
            // TODO: Consider checking if a tab has been closed prematurely all the time.
            // Currently, only tabLoaded checks for this.
            const actionIds = getClientsActionIds(client);
            await dispatch('runActionsOnClient', { client, actionIds, parentTaskId: rootTask.id });
          }
          /* eslint-enable no-await-in-loop */
        } catch (error) {
          rootTask.setError(error);
        } finally {
          if (rootState.config.sendNotifications) {
            notify({
              title: 'All tasks complete',
              message: `Finished running ${clients.length} client(s)`,
            });
          }
          rootTask.markAsComplete();
          rootTask.setStateBasedOnChildren();
        }
      } else {
        log.setCategory('clientAction');
        log.showError('No clients found');
      }
    },
    /**
     * Runs the passed actions on all clients.
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {number[]} actionIds
     * @param {number[]} clientIds
     */
    async runSelectedActionsOnAllClients({ dispatch }, { actionIds, clientIds }) {
      await dispatch('run', {
        clientIds,
        getClientsActionIds: () => actionIds,
      });
    },
    /**
     * Re-runs all the actions that failed on the clients they failed on.
     * @param {ActionContext} context
     */
    async retryFailures({ getters, dispatch }) {
      // Use a copy of the failures as they are reset on each run.
      const failuresByClient = Object.assign({}, getters.failuresByClient);
      await dispatch('run', {
        clientIds: Object.keys(failuresByClient),
        getClientsActionIds: client => failuresByClient[client.id],
      });
    },
  },
};
export default module;
