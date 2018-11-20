import store from '@/store';
import { getListItemStore } from '@/store/helpers/list_store';

/**
 * Gets a task's ListItemStore from an ID.
 * @param {number} id
 * @returns {import('@/store/helpers/list_store').ListItemStore}
 */
export function taskFromId(id) {
  return getListItemStore({
    id,
    namespace: 'tasks',
    list: 'tasks',
  });
}

/**
 * Creates a new task.
 * @param {import('@/store/modules/tasks').TaskState} data
 */
export async function createTask(data) {
  const id = await store.dispatch('tasks/create', data);
  return taskFromId(id);
}
