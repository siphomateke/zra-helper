import Vue from 'vue';
import ListStoreHelper from '@/store/helpers/list_store/module_helpers';

/**
 * @typedef {Object} TaskState
 * @property {string} [title='']
 * @property {number} [id=lastTaskId]
 * @property {string} [status='']
 * @property {string} [state=null]
 * @property {number} [progress=-1]
 * @property {number} [progressMax=100]
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

let lastTaskId = 0;

export const taskStates = {
  ERROR: 'error',
  SUCCESS: 'success',
  WARNING: 'warning',
};

function getChildProgress(type, { getters, task, id }) {
  let result = 0;
  let hasAutoUpdateChildren = false;
  for (const childId of task.children) {
    const childTask = getters.getTaskById(childId);
    if (childTask.autoUpdateParent) {
      hasAutoUpdateChildren = true;
      if (task.unknownMaxProgress) {
        // If task execution sequential, change this tasks maximum
        // and total progress on the fly.
        if (!task.sequential) {
          result += getters[type](childId);
          // Otherwise, use the first uncompleted task as the current task.
        } else if (!getters.complete(childTask.id)) {
          result = getters[type](childId);
          break;
        }
      } else {
        result += getters[type](childId);
      }
    }
  }
  if (hasAutoUpdateChildren && !getters.complete(id)) {
    return result;
  }
  return null;
}

const listStoreHelper = new ListStoreHelper('tasks', 'task', 'getTaskById');

export default {
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
      childStates: ({ getters, id }) => {
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
        const childStates = getters.childStates(id);
        for (const state of Object.keys(childStates)) {
          const count = childStates[state];
          stateStrings.push(`${count} ${state}(s)`);
        }
        return stateStrings.join(', ');
      },
      getStatusFromError: ({ task }) => {
        if (task.error) {
          return task.error.message ? task.error.message : task.error.toString();
        }
        return null;
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
        if (getters.hasChildren(id)) {
          const progressMax = getChildProgress('progressMax', { getters, task, id });
          if (progressMax !== null && task.unknownMaxProgress) {
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
     * @param {import('vuex').Store} store
     * @param {TaskState} task
     */
    create({ commit }, data = {}) {
      const task = Object.assign({
        id: lastTaskId,
        title: '',
        status: '',
        state: null,
        progress: -1,
        progressMax: 100,
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
    /**
     * Sets this task's error, state and status.
     */
    setError({ commit, getters }, { id, error }) {
      commit('setError', { id, value: error });
      commit('setState', { id, value: taskStates.ERROR });
      commit('setStatus', { id, value: getters.getStatusFromError(id) });
    },
    /**
     * Increments progress and sets status.
     */
    addStep({ commit, getters }, { id, status, increment = 1 }) {
      commit('setProgress', { id, value: getters.progress(id) + increment });
      commit('setStatus', { id, value: status });
    },
    /**
     * Refresh progress based on children.
     */
    /* refresh({ commit, getters }, { id }) {
      const task = getters.getTaskById(id);

      let progress = 0;
      let progressMax = 0;
      let complete = true;
      for (const childTask of getters.children(id)) {
        if (!childTask.complete) {
          complete = false;
        }
        if (task.unknownMaxProgress) {
          // If task execution sequential, change this tasks maximum
          // and total progress on the fly.
          if (!task.sequential) {
            progress += childTask.progress;
            progressMax += childTask.progressMax;
            // Otherwise, use the first uncompleted task as the current task.
          } else if (!childTask.complete) {
            progress = childTask.progress;
            progressMax = childTask.progressMax;
            break;
          }
        } else {
          progress += childTask.progress;
        }
      }
      if (!complete) {
        if (task.unknownMaxProgress) {
          commit('setProgressMax', { id, value: progressMax });
        }
        commit('setProgress', { id, value: progress });
      }
      if (complete !== task.complete) {
        commit('setComplete', { id, value: complete });
      }
    }, */
  },
};