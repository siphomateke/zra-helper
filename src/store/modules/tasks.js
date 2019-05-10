import Vue from 'vue';
import ListStoreHelper from '@/store/helpers/list_store/module_helpers';
import { errorToString } from '@/backend/errors';

let lastTaskId = 0;

/** @typedef {string} TaskState */

/** @enum {TaskState} */
export const taskStates = {
  ERROR: 'error',
  SUCCESS: 'success',
  WARNING: 'warning',
};

/**
 * @typedef {Object} TaskVuexState
 * @property {string} [title='']
 * @property {string} [anonymousTitle='']
 * @property {number} [id=lastTaskId]
 * @property {string} [status='']
 * @property {TaskState} [state=null]
 * @property {number} [progress=0]
 * @property {number} [progressMax=1]
 * @property {Boolean} [indeterminate=false]
 * @property {number[]} [children=[]] Child IDs
 * @property {boolean} [complete=false]
 * @property {Error} [error=null]
 * @property {string} [errorString='']
 * @property {number} [parent=null] Parent ID
 * @property {boolean} [unknownMaxProgress=true]
 * Whether the maximum progress of this task can be determined.
 *
 * This is used to determine this task's progress from it's children
 * and is thus only used if it has children.
 *
 * Only set this to false if the total number of children that this
 * task can ever have and their maximum progress' are known.
 * If set to false then `progressMax` must also be set.
 *
 * @property {boolean} [sequential=true] Whether only one child task will be running at a time.
 * @property {boolean} [autoUpdateParent=true]
 * Whether this task will automatically update it's parent progress and status.
 * @property {boolean} [isRoot=false]
 * Whether this task is at the highest level and has no parents. Root tasks are generally
 * associated with a single client action run.
 */

/**
 * @typedef {Object} TaskCreateOptions_Temp
 * @property {string} [list]
 */
/** @typedef {TaskVuexState & TaskCreateOptions_Temp} TaskCreateOptions */

// TODO: Document this module. Especially the getters.
// TODO: Figure out how to use function documentation in transitional tasks module.

/**
 * Calculates a task's progress or maximum progress based on its children.
 * @param {'progress'|'progressMax'} type The type of progress to get.
 * @param {Object} param
 * @param {any} param.getters
 * @param {TaskVuexState} param.task The the task whose progress we would like to determine.
 * @param {number} param.id The ID of the task whose progress we would like to determine.
 */
function getChildProgress(type, { getters, task, id }) {
  let result = 0;
  let hasAutoUpdateChildren = false;
  if (!getters.complete(id) && (type === 'progress' || task.unknownMaxProgress)) {
    for (const childId of task.children) {
      /** @type {TaskVuexState} */
      const childTask = getters.getTaskById(childId);
      if (childTask.autoUpdateParent) {
        hasAutoUpdateChildren = true;
        const childTaskProgress = getters[type](childId);
        if (task.unknownMaxProgress) {
          // If task execution is not sequential, change this tasks maximum
          // and total progress on the fly.
          if (!task.sequential) {
            result += childTaskProgress;
            // Otherwise, use the first uncompleted task as the current task.
          } else if (!getters.complete(childTask.id)) {
            result = childTaskProgress;
            break;
          }
        } else if (type === 'progress') {
          result += childTaskProgress / getters.progressMax(childId);
        }
      }
    }
    if (hasAutoUpdateChildren) {
      return result;
    }
  }
  return null;
}

const listStoreHelper = new ListStoreHelper('tasks', 'task', 'getTaskById');

/** @type {import('vuex').Module} */
const vuexModule = {
  namespaced: true,
  state: {
    /**
     * Default task list.
     * @type {number[]}
     */
    all: [],
    /**
     * Client action related task IDs.
     * @type {number[]}
     */
    clientActions: [],
    /**
     * Tasks related to logging into a single client.
     * @type {number[]}
     */
    login: [],
    /**
     * Object containing tasks as values and their corresponding IDs as keys.
     * @type {Object.<string, TaskVuexState>}
     */
    tasks: {},
  },
  getters: {
    getTaskById: state => id => state.tasks[id],
    ...listStoreHelper.itemGetters({
      hasParent: ({ task }) => task.parent !== null,
      parent: ({ getters, task }) => getters.getTaskById(task.parent),
      hasChildren: ({ task }) => task.children.length > 0,
      children: ({ getters, task }) => task.children.map(childId => getters.getTaskById(childId)),
      childStateCounts: ({ getters, id }) => {
        const stateCounts = {};
        for (const task of getters.children(id)) {
          if (task.state) {
            if (!stateCounts[task.state]) stateCounts[task.state] = 0;
            stateCounts[task.state] += 1;
          }
        }
        return stateCounts;
      },
      childStateString: ({ getters, id }) => {
        const stateStrings = [];
        const childStateCounts = getters.childStateCounts(id);
        for (const state of Object.keys(childStateCounts)) {
          const count = childStateCounts[state];
          stateStrings.push(`${count} ${state}(s)`);
        }
        return stateStrings.join(', ');
      },
      complete: ({ getters, id, task }) => {
        if (getters.hasChildren(id)) {
          let complete = true;
          let hasAutoUpdateChildren = false;
          for (const childTask of getters.children(id)) {
            if (childTask.autoUpdateParent) {
              hasAutoUpdateChildren = true;
              if (!getters.complete(childTask.id)) {
                complete = false;
                break;
              }
            }
          }
          if (hasAutoUpdateChildren) {
            return complete;
          }
        }
        return task.complete;
      },
      progress: ({ getters, id, task }) => {
        if (getters.hasChildren(id)) {
          const progress = getChildProgress('progress', { getters, task, id });
          if (progress !== null) {
            return progress;
          }
        }
        return task.progress;
      },
      progressMax: ({ getters, id, task }) => {
        if (getters.hasChildren(id) && task.unknownMaxProgress) {
          const progressMax = getChildProgress('progressMax', { getters, task, id });
          if (progressMax !== null) {
            return progressMax;
          }
        }
        return task.progressMax;
      },
    }),
  },
  mutations: {
    /**
     * Adds a task object to the state.
     * @param {any} state
     * @param {Object} payload
     * @param {number} payload.id
     * @param {TaskVuexState} payload.task
     */
    create(state, { id, task }) {
      Vue.set(state.tasks, id, task);
    },
    /**
     * Adds a particular task to a certain list. Mainly used for the top-level list of tasks.
     * @param {any} state
     * @param {Object} payload
     * @param {number} payload.id
     * @param {string} payload.name The name of the list to add this task to.
     */
    addToList(state, { id, name = 'all' }) {
      state[name].push(id);
    },
    /**
     * Adds several child tasks to a task.
     * @param {any} state
     * @param {Object} payload
     * @param {number} payload.id The ID of the task to add child tasks to.
     * @param {number[]} payload.children The IDs of the child tasks to add.
     */
    addChildren(state, { id, children }) {
      for (const child of children) {
        state.tasks[id].children.push(child);
      }
    },
    /**
     * Sets a task's state.
     * @param {any} state
     * @param {Object} payload
     * @param {number} payload.id
     * @param {TaskState} payload.value The task state
     */
    setState(state, { id, value }) {
      if (Object.values(taskStates).includes(value)) {
        Vue.set(state.tasks[id], 'state', value);
      } else {
        const validStates = `['${Object.values(taskStates).join("', '")}']`;
        // eslint-disable-next-line max-len
        throw new Error(`Cannot set task state to invalid value, '${value}'. Task state must be one of the following: ${validStates}`);
      }
    },
    /**
     * Sets a task's error and human readable version of that error.
     * @param {any} state
     * @param {Object} payload
     * @param {number} payload.id
     * @param {Error} payload.value The error
     */
    setError(state, { id, value }) {
      Vue.set(state.tasks[id], 'error', value);
      Vue.set(state.tasks[id], 'errorString', errorToString(value));
    },
    ...listStoreHelper.itemMutations([
      'title',
      'anonymousTitle',
      'status',
      'progress',
      'progressMax',
      'children',
      'complete',
      'errorString',
      'parent',
      'unknownMaxProgress',
      'sequential',
      'autoUpdateParent',
      'indeterminate',
    ]),
  },
  actions: {
    /**
     * Creates a new task and returns its ID.
     * @param {import('vuex').ActionContext} store
     * @param {TaskCreateOptions} data
     * @returns {number} The newly-created task's ID.
     */
    create({ commit }, data = { list: 'all' }) {
      const task = Object.assign({
        id: lastTaskId,
        title: '',
        status: '',
        state: null,
        progress: 0,
        progressMax: 1,
        indeterminate: false,
        children: [],
        complete: false,
        error: null,
        errorString: '',
        parent: null,
        unknownMaxProgress: true,
        sequential: true,
        autoUpdateParent: true,
        isRoot: false,
      }, data);
      if (!('anonymousTitle' in task)) {
        task.anonymousTitle = task.title;
      }
      const { id } = task;
      commit('create', { id, task });
      lastTaskId += 1;

      if (task.parent === null) {
        commit('addToList', { id, name: data.list });
      } else {
        commit('addChildren', { id: task.parent, children: [id] });
      }

      return id;
    },
    /**
     * Marks this task as complete and sets its progress to the maximum value.
     * @param {import('vuex').ActionContext} context
     * @param {Object} payload
     * @param {number} payload.id
     */
    markAsComplete({ commit, getters }, { id }) {
      commit('setComplete', { id, value: true });
      commit('setProgress', { id, value: getters.progressMax(id) });
      commit('setStatus', { id, value: '' });
    },
    /**
     * Sets this task's error to the provided one, its state to ERROR and its status to one based
     * on the error.
     * @param {import('vuex').ActionContext} context
     * @param {Object} payload
     * @param {number} payload.id
     * @param {any} payload.error
     */
    setError({ commit, rootState }, { id, error }) {
      commit('setError', { id, value: error });
      commit('setState', { id, value: taskStates.ERROR });
      if (rootState.config.debug.showTaskErrorsInConsole) {
        // eslint-disable-next-line no-console
        console.log(error);
      }
    },
    /**
     * Increments progress and sets status.
     * @param {import('vuex').ActionContext} context
     * @param {Object} payload
     * @param {number} payload.id
     * @param {TaskState} payload.status
     * @param {number} [payload.increment=1] The amount to increment progress by.
     */
    addStep({ commit, getters }, { id, status, increment = 1 }) {
      commit('setProgress', { id, value: getters.progress(id) + increment });
      commit('setStatus', { id, value: status });
    },
    /**
     * Sets this task's state based on its children.
     * - all children error then error
     * - any child error then warning
     * - else success
     * @param {import('vuex').ActionContext} context
     * @param {Object} payload
     * @param {number} payload.id
     */
    setStateBasedOnChildren({ commit, getters }, { id }) {
      const childStateCounts = getters.childStateCounts(id);
      const children = getters.children(id);
      let state;
      if (childStateCounts[taskStates.ERROR] === children.length) {
        state = taskStates.ERROR;
      } else if (
        childStateCounts[taskStates.ERROR] > 0
        || childStateCounts[taskStates.WARNING] > 0
      ) {
        state = taskStates.WARNING;
      } else {
        state = taskStates.SUCCESS;
      }
      commit('setState', { id, value: state });
    },
    /**
     * Sets this tasks error to be the same as it's child's error if it only has one child.
     * @param {import('vuex').ActionContext} context
     * @param {Object} payload
     * @param {number} payload.id
     */
    async setErrorBasedOnChildren({ getters, dispatch }, { id }) {
      const children = getters.children(id);
      if (children.length === 1) {
        const childTask = children[0];
        await dispatch('setError', { id, error: childTask.error });
      }
    },
  },
};
export default vuexModule;
