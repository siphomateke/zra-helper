import Vue from 'vue';
import ListStoreHelper from '@/store/helpers/list_store/module_helpers';

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
 * @property {number} [id=lastTaskId]
 * @property {string} [status='']
 * @property {TaskState} [state=null]
 * @property {number} [progress=0]
 * @property {number} [progressMax=1]
 * @property {number[]} [children=[]] Child IDs
 * @property {boolean} [complete=false]
 * @property {Error} [error=null]
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
 */

// TODO: Document this module. Especially the getters.

/**
 * Calculates a task's progress or maximum progress based on its children.
 * @param {'progress'|'progressMax'} type The type of progress to get.
 * @param {Object} param
 * @param {any} param.getters
 * @param {TaskVuexState} param.task The the task whose progress we would like to determine.
 * @param {number} param.id The ID of the task whose progress we would like to determine.
 */
// TODO: Optimise by checking conditions before looping
function getChildProgress(type, { getters, task, id }) {
  let result = 0;
  let hasAutoUpdateChildren = false;
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
  if (hasAutoUpdateChildren && !getters.complete(id)) {
    return result;
  }
  return null;
}

const listStoreHelper = new ListStoreHelper('tasks', 'task', 'getTaskById');

/** @type {import('vuex').Module} */
const module = {
  namespaced: true,
  state: {
    all: [],
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
    create(state, { id, task }) {
      Vue.set(state.tasks, id, task);
    },
    addToList(state, { name = 'all', id }) {
      state[name].push(id);
    },
    addChildren(state, { id, children }) {
      for (const child of children) {
        state.tasks[id].children.push(child);
      }
    },
    ...listStoreHelper.itemMutations([
      'title',
      // TODO: Make sure state is a taskState when set
      'state',
      'status',
      'progress',
      'progressMax',
      'children',
      'complete',
      'error',
      'parent',
      'unknownMaxProgress',
      'sequential',
      'autoUpdateParent',
    ]),
  },
  actions: {
    /**
     * @param {import('vuex').ActionContext} store
     * @param {TaskVuexState} data
     */
    create({ commit }, data = {}) {
      const task = Object.assign({
        id: lastTaskId,
        title: '',
        status: '',
        state: null,
        progress: 0,
        progressMax: 1,
        children: [],
        complete: false,
        error: null,
        parent: null,
        unknownMaxProgress: true,
        sequential: true,
        autoUpdateParent: true,
      }, data);
      const { id } = task;
      commit('create', { id, task });
      lastTaskId += 1;

      if (task.parent === null) {
        commit('addToList', { id, name: 'all' });
      } else {
        commit('addChildren', { id: task.parent, children: [id] });
      }

      return id;
    },
    markAsComplete({ commit, getters }, { id }) {
      commit('setComplete', { id, value: true });
      commit('setProgress', { id, value: getters.progressMax(id) });
    },
    /**
     * Sets this task's error, state and status.
     */
    setError({ commit, dispatch }, { id, error }) {
      commit('setError', { id, value: error });
      commit('setState', { id, value: taskStates.ERROR });
      dispatch('setErrorAsStatus', { id });
    },
    /**
     * Increments progress and sets status.
     */
    addStep({ commit, getters }, { id, status, increment = 1 }) {
      commit('setProgress', { id, value: getters.progress(id) + increment });
      commit('setStatus', { id, value: status });
    },
    // TODO: Decide if this should be done automatically
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
    setErrorAsStatus: ({ commit, getters }, { id }) => {
      const task = getters.getTaskById(id);
      let status = null;
      if (task.error) {
        status = task.error.message ? task.error.message : task.error.toString();
      }
      commit('setStatus', { id, value: status });
    },
  },
};
export default module;
