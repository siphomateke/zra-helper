import Vue from 'vue';
import store from '@/store';
import log from '@/transitional/log';
import createTask from '@/transitional/tasks';
import { taskStates } from '@/store/modules/tasks';
import { logout, robustLogin } from '@/backend/client_actions/base';
import { writeJson } from '@/backend/file_utils';
import { InvalidClientError } from '@/backend/errors';

/**
 * @typedef {import('vuex').ActionContext} ActionContext
 * @typedef {import('@/backend/constants').Client} Client
 * @typedef {import('@/backend/client_actions/base').ClientActionObject} ClientActionObject
 */

/**
 * @typedef {Object} ClientActionState.Temp
 * @property {string} logCategory The log category to use when logging anything in this action.
 * @property {boolean} hasOutput Whether this task's function returns an output.
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
  },
  mutations: {
    /**
     * Adds a new client action.
     * @param {any} state
     * @param {ClientActionObject} payload
     */
    add(state, {
      id,
      name,
      func,
      hasOutput = false,
      defaultOutputFormat,
      outputFormatter,
    }) {
      Vue.set(state.all, id, {
        id,
        name,
        func,
        hasOutput,
        defaultOutputFormat,
        outputFormatter,
        // TODO: Consider letting this be set by a parameter
        logCategory: id,
        outputs: [],
      });
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
     */
    async runActionOnClient({ rootState, getters, commit }, {
      actionId, client, mainTask, isSingleAction,
    }) {
      if (client.valid) {
        /** @type {ClientActionState} */
        const clientAction = getters.getActionById(actionId);
        const clientActionConfig = rootState.config.actions[actionId];

        const task = await createTask(store, { title: clientAction.name, parent: mainTask.id });
        try {
          if (clientAction.func) {
            log.setCategory(clientAction.logCategory);

            const output = await clientAction.func({
              client,
              parentTask: task,
              clientActionConfig,
            });
            commit('setOutput', { actionId, clientId: client.id, value: output });
          } else {
            task.state = taskStates.SUCCESS;
          }
        } catch (error) {
          log.setCategory(clientAction.logCategory);
          log.showError(error);
          task.setError(error);
          // If this is the only action being run on this client,
          // show any errors produced by it on the main task.
          if (isSingleAction) {
            mainTask.setError(error);
          } else {
            // Show a warning on the main task to indicate that one of the actions failed.
            mainTask.state = taskStates.WARNING;
          }
          commit('setOutput', { actionId, clientId: client.id, error });
        } finally {
          task.markAsComplete();
        }
      } else {
        commit('setOutput', {
          actionId,
          clientId: client.id,
          error: new InvalidClientError('Client is invalid', null, client),
        });
      }
    },
    /**
     * Runs several actions in parallel on a single client.
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {Client} payload.client
     * @param {ClientActionId[]} payload.actionIds
     */
    async runActionsOnClient({ rootState, getters, dispatch }, { client, actionIds }) {
      const isSingleAction = actionIds.length === 1;
      let singleAction = null;
      let taskTitle = client.name;
      // If there is only one action, include it's name in the task's name.
      if (isSingleAction) {
        singleAction = getters.getActionById(actionIds[0]);
        taskTitle = `${client.name}: ${singleAction.name}`;
      }
      const mainTask = await createTask(store, {
        title: taskTitle,
        unknownMaxProgress: false,
        progressMax: 2 + actionIds.length,
        sequential: singleAction,
      });
      try {
        let loggedIn = false;
        if (client.valid) {
          mainTask.status = 'Logging in';
          await robustLogin(client, mainTask.id, rootState.config.maxLoginAttempts);
          loggedIn = true;
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
          }));
        }
        await Promise.all(promises);

        if (loggedIn) {
          // If an error message was set, don't overwrite it
          // TODO: Update me when task's status can be separate from error messages [task status]
          if (mainTask.state !== taskStates.ERROR) {
            mainTask.status = 'Logging out';
          }
          await logout(mainTask.id);
        }

        // TODO: Update me when task's status can be separate from error messages [task status]
        if (mainTask.state !== taskStates.ERROR && mainTask.state !== taskStates.WARNING) {
          if (mainTask.childStateCounts[taskStates.WARNING] > 0) {
            mainTask.state = taskStates.WARNING;
          } else {
            mainTask.state = taskStates.SUCCESS;
          }
        }

        // only clear status if the last status was not an error message
        // TODO: Update me when task's status can be separate from error messages [task status]
        if (mainTask.state !== taskStates.ERROR) {
          mainTask.status = '';
        }
      } catch (error) {
        log.setCategory(client.name);
        log.showError(error);
        mainTask.setError(error);
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
    async runAll({ dispatch }, { actionIds, clients }) {
      if (clients.length > 0) {
        for (const client of clients) {
          // TODO: Consider checking if a tab has been closed prematurely all the time.
          // Currently, only tabLoaded checks for this.
          await dispatch('runActionsOnClient', { client, actionIds });
        }
      } else {
        log.setCategory('clientAction');
        log.showError('No clients found');
      }
    },
  },
};
export default module;
