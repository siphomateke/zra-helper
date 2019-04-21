import { getListItemStore, ListItemStore } from '@/store/helpers/list_store';
import log from '@/transitional/log';
import { TaskVuexState, TaskState, TaskVuexStateOptional } from '@/store/modules/tasks';
import { Omit } from '@/utils';
import { Store } from 'vuex';

/**
 * Gets a task's ListItemStore from an ID.
 */
function taskFromId<S>(store: Store<S>, id: number): ListItemStore<S> {
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

class Task<S> {
  listStoreTask: ListItemStore<S> | null = null;

  /**
   * Creates a new task.
   */
  async init(store: Store<S>, data: TaskVuexStateOptional): Promise<TaskObject> {
    const id = await store.dispatch('tasks/create', data);
    this.listStoreTask = taskFromId(store, id);
    return new Proxy(this, {
      get(obj: Task<S>, prop: string) {
        /**
         * TODO: Find a less hacky way to prevent the Proxy from overriding actual properties and
         * methods.
         */
        if (
          typeof prop === 'string'
          && prop !== 'addStep'
          && prop !== 'setError'
          && prop !== 'listStoreTask'
        ) {
          return obj.listStoreTask[prop];
        }
        return Reflect.get(...arguments); // eslint-disable-line prefer-rest-params
      },
      set(obj: Task<S>, prop: string, value: any) {
        obj.listStoreTask[prop] = value;
        return true;
      },
    });
  }

  setError(error: Error) {
    this.listStoreTask.setError({ error });
  }

  addStep(status: string, increment: number | null = null) {
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
  data: TaskVuexStateOptional,
): Promise<TaskObject> {
  try {
    const task = new Task<S>();
    const taskProxy = await task.init(store, data);
    return taskProxy;
  } catch (error) {
    log.showError(error);
    throw error;
  }
}
