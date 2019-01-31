import Vue from 'vue';
import store from '@/store';
import log from '@/transitional/log';
import createTask from '@/transitional/tasks';
import { taskStates } from '@/store/modules/tasks';
import { logout, robustLogin } from '@/backend/client_actions/base';
import { writeJson } from '@/backend/file_utils';

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

/**
 * @typedef {ClientActionObject & ClientActionState.Temp} ClientActionState
 *
 * @typedef {string} ClientUsername
 * @typedef {Object} ClientActionOutput
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
      outputFormatter = data => writeJson(data),
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
    setOutput(state, { id, clientId, value }) {
      const outputId = id + clientId;
      Vue.set(state.outputs, outputId, {
        actionId: id,
        clientId,
        value,
      });
      state.all[id].outputs.push(outputId);
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
     * @param {ClientActionId} actionId
     * @param {Client} client
     */
    async runActionOnClient({ rootState, getters, dispatch }, { actionId, client }) {
      /** @type {ClientActionState} */
      const clientAction = getters.getActionById(actionId);
      const clientActionConfig = rootState.config.actions[actionId];

      const mainTask = await createTask(store, { title: `${client.name}: ${clientAction.name}` });
      try {
        mainTask.status = 'Logging in';
        await robustLogin(client, mainTask.id, rootState.config.maxLoginAttempts);

        if (clientAction.func) {
          mainTask.status = clientAction.name;
          const task = await createTask(store, { title: clientAction.name, parent: mainTask.id });
          log.setCategory(clientAction.logCategory);

          const output = await clientAction.func({
            client,
            parentTask: task,
            clientActionConfig,
          });
          dispatch('setOutput', { actionId, client, value: output });

          if (task.state === taskStates.ERROR) {
            mainTask.state = taskStates.ERROR;
          }
        }

        mainTask.status = 'Logging out';
        await logout(mainTask.id);

        if (mainTask.state !== taskStates.ERROR) {
          if (mainTask.childStateCounts[taskStates.WARNING] > 0) {
            mainTask.state = taskStates.WARNING;
          } else {
            mainTask.state = taskStates.SUCCESS;
          }
        }
        mainTask.status = '';
      } catch (error) {
        log.setCategory(clientAction.logCategory);
        log.showError(error);
        mainTask.setError(error);
      } finally {
        mainTask.markAsComplete();
      }
    },
    /**
     * Runs an action on a list of clients.
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {ClientActionId} actionId
     * @param {Client[]} clients
     */
    async runAction({ dispatch, commit }, { actionId, clients }) {
      for (const client of clients) {
        await dispatch('runActionOnClient', { actionId, client });
      }
    },
    /**
     * Runs each client action on each client.
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {ClientActionId[]} actionIds
     * @param {Client[]} clients
     */
    async runAll({ dispatch }, { actionIds, clients }) {
      if (clients.length > 0) {
        for (const actionId of actionIds) {
          // TODO: Consider checking if a tab has been closed prematurely all the time.
          // Currently, only tabLoaded checks for this.
          dispatch('runAction', { actionId, clients });
        }
      } else {
        log.setCategory('clientAction');
        log.showError('No clients found');
      }
    },
    /**
     * Sets the output for a single client in an action.
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {ClientActionId} payload.actionId
     * @param {Client} payload.client
     * @param {Object} payload.value
     */
    setOutput({ commit }, { actionId, client, value }) {
      commit('setOutput', { id: actionId, clientId: client.username, value });
    },
  },
};
export default module;
