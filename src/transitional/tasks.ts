import { getListItemStore } from '@/store/helpers/list_store';
import log from '@/transitional/log';
import { TaskVuexState, TaskState, TaskVuexStateOptional } from '@/store/modules/tasks';
import { Omit } from '@/utils';
import { Store } from 'vuex';

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

/** Wrapper around the task Vuex module to make it compatible with legacy code. */
export interface TaskObject extends Omit<TaskVuexState, 'children' | 'parent'> {
  hasParent: boolean;
  parent: TaskObject;
  hasChildren: boolean;
  children: TaskObject[];
  /** Total number of child states per state type */
  childStateCounts: { [key in TaskState]?: number };
  childStateString: string;
  complete: boolean;
  progress: number;
  progressMax: number;
  markAsComplete: Function;
  setError: (error: Error) => void;
  addStep: (status: string, increment?: number) => void;
  setStateBasedOnChildren: Function;
  setErrorBasedOnChildren: Function;
}

class Task {
  constructor() {
    this.listStoreTask = null;
  }

  /**
   * Creates a new task.
   * @param {VuexStore} store
   * @param {TaskVuexState} data
   */
  async init(store, data) {
    const id = await store.dispatch('tasks/create', data);
    this.listStoreTask = taskFromId(store, id);
    return new Proxy(this, {
      /**
       * @param {Task} obj
       * @param {string} prop
       */
      get(obj, prop) {
        /**
         * TODO: Find a less hacky way to prevent the Proxy from overriding actual properties and
         * methods.
         */
        if (
          typeof prop === 'string' &&
          prop !== 'addStep' &&
          prop !== 'setError' &&
          prop !== 'listStoreTask'
        ) {
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
 */
// FIXME: Make sure the right properties are marked as optional.
export default async function createTask<S>(
  store: Store<S>,
  data: TaskVuexStateOptional
): Promise<TaskObject> {
  try {
    const task = new Task();
    const taskProxy = await task.init(store, data);
    return taskProxy;
  } catch (error) {
    log.showError(error);
    throw error;
  }
}
