import store from '@/store';
import log from '@/transitional/log';
import output from '@/transitional/output';
import createTask from '@/transitional/tasks';
import { taskStates } from '@/store/modules/tasks';
import { logout, robustLogin } from '@/backend/client_actions/base';

/**
 * @typedef {import('@/backend/client_actions/base').ClientActionObject} ClientActionObject
 */

/**
 * @typedef {Object} ClientActionState.Temp
 * @property {string} logCategory
 */

/**
 * @typedef {ClientActionObject & ClientActionState.Temp} ClientActionState
 */

// TODO: Document state and actions
/** @type {import('vuex').Module} */
const module = {
  namespaced: true,
  state: {
    all: [],
  },
  getters: {
    getActionById: state => id => state.all[id],
  },
  mutations: {
    add(state, { id, name, func }) {
      state.all[id] = {
        id,
        name,
        func,
        // TODO: Consider letting this be set by a parameter
        logCategory: id,
      };
    },
  },
  actions: {
    // TODO: Refer to action IDs as the same thing throughout
    async add({ commit }, { id, name, func }) {
      commit('add', { id, name, func });
    },
    async runActionOnClient({ rootState, getters }, { actionId, client }) {
      /** @type {ClientActionState} */
      const clientAction = getters.getActionById(actionId);
      const clientActionConfig = rootState.config.actions[actionId];

      const mainTask = await createTask(store, { title: `${client.name}: ${clientAction.name}` });
      try {
        mainTask.status = 'Logging in';
        await robustLogin(client, mainTask.id);

        if (clientAction.func) {
          mainTask.status = clientAction.name;
          const task = await createTask(store, { title: clientAction.name, parent: mainTask.id });
          log.setCategory(clientAction.logCategory);

          await clientAction.func({
            client,
            parentTask: task,
            output,
            clientActionConfig,
          });

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
    async runAction({ dispatch }, { actionId, clients }) {
      for (const client of clients) {
        await dispatch('runActionOnClient', { actionId, client });
      }
    },
    async runAll({ dispatch }, { actions: actionIds, clients }) {
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
  },
};
export default module;
