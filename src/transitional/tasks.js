import { getListItemStore } from '@/store/helpers/list_store';

/** @typedef {import('vuex').Store} VuexStore */

/**
 * Gets a task's ListItemStore from an ID.
 * @param {VuexStore} store
 * @param {number} id
 * @returns {import('@/store/helpers/list_store').ListItemStore}
 */
function taskFromId(store, id) {
  return getListItemStore(store, {
    id,
    namespace: 'tasks',
    list: 'tasks',
  });
}

/** @typedef {import('@/store/modules/tasks').TaskState} TaskState */

/**
 * @typedef {function} Task.setError
 * @param {Error} error
 */

/**
 * @typedef {function} Task.addStep
 * @param {string} status
 * @param {number} increment
 */

/**
 * @typedef TaskObjectType
 * @property {boolean} hasParent
 * @property {TaskObject} parent
 * @property {boolean} hasChildren
 * @property {number[]} children
 * @property {Object.<TaskState, number>} childStateCounts Total number of child states per state type
 * @property {string} childStateString
 * @property {string} getStatusFromError
 * @property {boolean} complete
 * @property {number} progress
 * @property {number} progressMax
 *
 * @property {Task.setError} setError
 * @property {Task.addStep} addStep
 */

/**
 * @typedef {import('@/store/modules/tasks').TaskVuexState} TaskVuexState
 */

/**
 * @typedef {TaskVuexState & TaskObjectType} TaskObject
 * Wrapper around the task Vuex module to make it compatible with legacy code.
 */

class Task {
  /**
   * Creates a new task.
   * @param {VuexStore} store
   * @param {TaskVuexState} data
   */
  constructor(store, data) {
    store.dispatch('tasks/create', data).then((id) => {
      this.listStoreTask = taskFromId(store, id);
    });
  }

  setError(error) {
    this.listStoreTask.setError({ error });
  }

  addStep(status, increment = null) {
    const options = { status };
    if (increment !== null) {
      options.increment = increment;
    }
    this.listStoreTask.addStep(options);
  }
}

/**
 * TODO: Document this
 * @param {VuexStore} store
 * @param {TaskVuexState} data
 * @return {TaskObject}
 */
export default function createTask(store, data) {
  const task = new Task(store, data);
  return new Proxy(task, {
    /**
     * @param {Task} obj
     * @param {string} prop
     */
    get(obj, prop) {
      if (typeof prop === 'string') {
        return obj.listStoreTask[prop];
      }
      return Reflect.get(...arguments); // eslint-disable-line prefer-rest-params
    },
    /**
     * @param {Task} obj
     * @param {string} prop
     * @param {*} value
     */
    set(obj, prop, value) {
      obj.listStoreTask[prop] = value;
      return true;
    },
  });
}
