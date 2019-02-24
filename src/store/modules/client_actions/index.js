import Vue from 'vue';
import store from '@/store';
import log from '@/transitional/log';
import createTask from '@/transitional/tasks';
import { taskStates } from '@/store/modules/tasks';
import { writeJson } from '@/backend/file_utils';
import { InvalidClientError } from '@/backend/errors';
import { clickElement, createTab, executeScript, sendMessage, tabLoaded, closeTab } from '@/backend/utils';

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
     * Creates a new tab, logs in and then closes the tab
     *
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {Client} payload.client
     * @param {number} payload.parentTaskId
     * @returns {Promise}
     * @throws {import('@/backend/errors').ExtendedError}
     */
    async login(context, { client, parentTaskId }) {
      const task = await createTask(store, {
        title: 'Login',
        parent: parentTaskId,
        progressMax: 7,
        status: 'Opening tab',
      });

      log.setCategory('login');
      log.log(`Logging in client "${client.name}"`);
      try {
        const tab = await createTab('https://www.zra.org.zm');
        task.addStep('Waiting for tab to load');
        try {
          await tabLoaded(tab.id);
          task.addStep('Navigating to login page');
          // Navigate to login page
          await clickElement(
            tab.id,
            // eslint-disable-next-line max-len
            '#leftMainDiv>tbody>tr:nth-child(2)>td>div>div>div:nth-child(2)>table>tbody>tr:nth-child(1)>td:nth-child(1)>ul>li>a',
            'go to login button',
          );
          task.addStep('Waiting for login page to load');
          await tabLoaded(tab.id);
          task.addStep('Logging in');
          // OCRAD should be imported in login.js but work with webpack
          await executeScript(tab.id, { file: 'ocrad.js' }, true);
          await executeScript(tab.id, { file: 'login.js' });
          // Actually login
          await sendMessage(tab.id, {
            command: 'login',
            client,
            maxCaptchaRefreshes: 10,
          });
          task.addStep('Waiting for login to complete');
          await tabLoaded(tab.id);
          task.addStep('Checking if login was successful');
          await executeScript(tab.id, { file: 'check_login.js' });
          await sendMessage(tab.id, {
            command: 'checkLogin',
            client,
          });
          /* const tokenKey = await sendMessage(tab.id, { command: 'getSessionData' });
          console.log('Token key: ', tokenKey); */
          task.state = taskStates.SUCCESS;
          log.log(`Done logging in "${client.name}"`);
        } finally {
          // Don't need to wait for the tab to close to carry out logged in actions
          // TODO: Catch tab close errors
          closeTab(tab.id);
        }
      } catch (error) {
        task.setError(error);
        throw error;
      } finally {
        task.markAsComplete();
      }
    },

    /**
     * Creates a new tab, logs out and then closes the tab
     *
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {number} payload.parentTaskId
     * @returns {Promise}
     */
    async logout(context, { parentTaskId }) {
      const task = await createTask(store, {
        title: 'Logout',
        parent: parentTaskId,
        unknownMaxProgress: false,
        progressMax: 3,
        status: 'Opening tab',
      });

      log.setCategory('logout');
      log.log('Logging out');
      try {
        const tab = await createTab('https://www.zra.org.zm/main.htm?actionCode=showHomePageLnclick');
        try {
          task.addStep('Initiating logout');
          // Click logout button
          await clickElement(tab.id, '#headerContent>tbody>tr>td:nth-child(3)>a:nth-child(23)', 'logout button');
          task.addStep('Waiting to finish logging out');
          task.state = taskStates.SUCCESS;
          log.log('Done logging out');
        } finally {
          // Note: The tab automatically closes after pressing logout
          // TODO: Catch tab close errors
          closeTab(tab.id);
        }
      } catch (error) {
        task.setError(error);
        throw error;
      } finally {
        task.markAsComplete();
      }
    },

    /**
     * Logs in a client and retries if already logged in as another client
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {Client} payload.client
     * @param {number} payload.parentTaskId
     * @param {number} payload.maxAttempts The maximum number of times an attempt should be made to login to a client.
     */
    async robustLogin({ dispatch }, { client, parentTaskId, maxAttempts }) {
      const task = await createTask(store, {
        title: 'Robust login',
        parent: parentTaskId,
        unknownMaxProgress: false,
        // After every login attempt except the last one, we logout.
        // So if the maximum number of login attempts is 3, we login 3 times but only logout 2 times.
        // Thus the total number of tasks would be 3 + (3-1) = 5
        progressMax: maxAttempts + (maxAttempts - 1),
      });
      let attempts = 0;
      let run = true;
      try {
        /* eslint-disable no-await-in-loop */
        while (run) {
          try {
            if (attempts > 0) {
              task.status = 'Logging in again';
            } else {
              task.status = 'Logging in';
            }
            await dispatch('login', { client, parentTaskId: task.id });
            run = false;
          } catch (error) {
            if (error.type === 'LoginError' && error.code === 'WrongClient' && attempts + 1 < maxAttempts) {
              log.setCategory('login');
              log.showError(error, true);
              task.status = 'Logging out';
              await dispatch('logout', { parentTaskId: task.id });
              run = true;
            } else {
              throw error;
            }
          }
          attempts++;
        }
        /* eslint-enable no-await-in-loop */
        task.state = taskStates.SUCCESS;
      } catch (error) {
        task.setError(error);
        throw error;
      } finally {
        task.markAsComplete();
      }
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
      /** @type {ClientActionState} */
      const clientAction = getters.getActionById(actionId);
      const clientActionConfig = rootState.config.actions[actionId];

      const task = await createTask(store, { title: clientAction.name, parent: mainTask.id });
      let taskHasError = false;
      try {
        if (clientAction.func) {
          log.setCategory(clientAction.logCategory);

          const output = await clientAction.func({
            client,
            parentTask: task,
            clientActionConfig,
          });
          commit('setOutput', { actionId, clientId: client.id, value: output });
          if (task.state === taskStates.ERROR) {
            taskHasError = true;
          }
        } else {
          task.state = taskStates.SUCCESS;
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
     */
    async runActionsOnClient({
      rootState, commit, getters, dispatch,
    }, { client, actionIds }) {
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
        sequential: singleAction,
      });
      try {
        if (client.valid) {
          mainTask.status = 'Logging in';
          await dispatch('robustLogin', {
            client,
            parentTaskId: mainTask.id,
            maxAttempts: rootState.config.maxLoginAttempts,
          });

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

          mainTask.status = 'Logging out';
          await dispatch('logout', { parentTaskId: mainTask.id });

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
    async runAll({ dispatch }, { actionIds, clients }) {
      if (clients.length > 0) {
        /* eslint-disable no-await-in-loop */
        for (const client of clients) {
          // TODO: Consider checking if a tab has been closed prematurely all the time.
          // Currently, only tabLoaded checks for this.
          await dispatch('runActionsOnClient', { client, actionIds });
        }
        /* eslint-enable no-await-in-loop */
      } else {
        log.setCategory('clientAction');
        log.showError('No clients found');
      }
    },
  },
};
export default module;
