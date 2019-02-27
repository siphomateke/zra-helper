import Vue from 'vue';
import store from '@/store';
import log from '@/transitional/log';
import createTask from '@/transitional/tasks';
import { taskStates } from '@/store/modules/tasks';
import { writeJson } from '@/backend/file_utils';
import { InvalidClientError, MissingTaxTypesError } from '@/backend/errors';
import { robustLogin, logout } from '@/backend/client_actions/user';
import { featuresSupportedByBrowsers, browserCodes, exportFormatCodes } from '@/backend/constants';
import { getCurrentBrowser, objectHasProperties, joinSpecialLast } from '@/utils';
import notify from '@/backend/notify';

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
 * @property {Client} client
 * @property {Object} value
 * @property {Error|null} error If there was an error when getting the client's output, this will bet set.
 */

/**
 * @typedef {string} ClientUsername
 * @typedef {string} ClientActionId
 * @typedef {Object.<ClientActionId, Object.<ClientUsername, ClientActionOutput>>} ClientActionOutputs
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
        requiresTaskTypes: false,
        // TODO: Consider letting this be set by a parameter
        logCategory: payload.id,
        outputs: [],
        requiredFeatures: [],
      }, payload);
      if (actualPayload.requiresTaskTypes) {
        // A logged in tab is required to get task types
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
  },
  actions: {
    // TODO: Refer to action IDs as the same thing throughout
    /**
     * Adds a new client action.
     * @param {ActionContext} context
     * @param {ClientActionObject} payload
     */
    async add({ commit, rootGetters }, payload) {
      // Add write to JSON as default output formatter
      if (!('outputFormatter' in payload && typeof payload.outputFormatter === 'function')) {
        payload.outputFormatter = data => writeJson(data);
      }

      // FIXME: Fix outputFormatter initial JSDOC. It doesn't have client objects in
      // the output until the following lines

      // Use client IDs to get client objects and add them to the output
      const payloadCopy = Object.assign({}, payload);
      payloadCopy.outputFormatter = (outputs, format) => {
        const outputsCopy = [];
        for (let i = 0; i < outputs.length; i++) {
          const output = outputs[i];
          outputsCopy[i] = Object.assign({
            client: rootGetters['clients/getClientById'](output.clientId),
          }, output);
        }
        return payload.outputFormatter(outputsCopy, format);
      };

      commit('add', payloadCopy);
    },

    /**
     * Runs an action on a single client.
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {ClientActionId} payload.actionId
     * @param {Client} payload.client
     * @param {import('@/transitional/tasks').TaskObject} payload.mainTask
     * @param {boolean} payload.isSingleAction Whether this is the only action running on this client
     * @param {number} payload.loggedInTabId ID of the logged in tab.
     */
    async runActionOnClient({ rootState, getters, commit }, {
      actionId, client, mainTask, isSingleAction, loggedInTabId,
    }) {
      /** @type {ClientActionState} */
      const clientAction = getters.getActionById(actionId);
      const clientActionConfig = rootState.config.actions[actionId];

      const task = await createTask(store, { title: clientAction.name, parent: mainTask.id });
      let taskHasError = false;
      try {
        if (!(clientAction.requiresTaskTypes && client.taxTypes === null)) {
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
      try {
        if (client.valid) {
          // Check if any of the actions require something
          const actionsThatRequire = {
            loggedInTab: [],
            taskTypes: [],
          };
          for (const actionId of actionIds) {
            const clientAction = getters.getActionById(actionId);
            if (clientAction.usesLoggedInTab) {
              actionsThatRequire.loggedInTab.push(actionId);
            }
            if (clientAction.requiresTaskTypes) {
              actionsThatRequire.taskTypes.push(actionId);
            }
          }

          const anyActionsNeedLoggedInTab = actionsThatRequire.loggedInTab.length > 0;
          const anyActionsRequireTaskTypes = actionsThatRequire.taskTypes.length > 0;

          // If any actions require task types, an extra task will be added to retrieve them.
          if (anyActionsRequireTaskTypes) {
            mainTask.progressMax += 1;
          }

          mainTask.status = 'Logging in';
          const loggedInTabId = await robustLogin({
            client,
            parentTaskId: mainTask.id,
            maxAttempts: rootState.config.maxLoginAttempts,
            keepTabOpen: anyActionsNeedLoggedInTab,
          });

          // Get tax types if any actions require them
          if (anyActionsRequireTaskTypes) {
            mainTask.status = 'Getting tax types';
            try {
              await dispatch('clients/getTaxTypes', {
                id: client.id,
                parentTaskId: mainTask.id,
                loggedInTabId,
              }, { root: true });
            } catch (error) {
              const allActionsRequireTaskTypes = actionsThatRequire.taskTypes.length === actionIds.length;
              if (allActionsRequireTaskTypes) {
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

          if (mainTask.state !== taskStates.ERROR && mainTask.state !== taskStates.WARNING) {
            if (mainTask.childStateCounts[taskStates.WARNING] > 0) {
              mainTask.state = taskStates.WARNING;
            } else {
              mainTask.state = taskStates.SUCCESS;
            }
          }
        } else {
          throw new InvalidClientError('Client is invalid', null, { client });
        }
      } catch (error) {
        log.setCategory(clientIdentifier);
        log.showError(error);
        mainTask.setError(error);
        for (const actionId of actionIds) {
          commit('setOutput', { actionId, clientId: client.id, error });
        }
      } finally {
        mainTask.markAsComplete();
      }
    },
    /**
     * Runs each client action on each client.
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {ClientActionId[]} payload.actionIds
     * @param {Client[]} payload.clients
     */
    async runAll({ rootState, dispatch }, { actionIds, clients }) {
      if (clients.length > 0) {
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
            await dispatch('runActionsOnClient', { client, actionIds, parentTaskId: rootTask.id });
          }
          /* eslint-enable no-await-in-loop */
        } catch (error) {
          rootTask.setError(error);
        } finally {
          if (rootState.config.sendNotifications) {
            notify({
              title: 'All tasks complete',
              message: `Finished running ${actionIds.length} action(s) on ${clients.length} client(s)`,
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
  },
};
export default module;
