import { getListItemStore } from '@/store/helpers/list_store';

/** @typedef {import('vuex').Store} VuexStore */

/**
 * Gets a task's ListItemStore from an ID.
 * @param {VuexStore} store
 * @param {number} id
 * @returns {import('@/store/helpers/list_store').ListItemStore}
 */
export function taskFromId(store, id) {
  return getListItemStore(store, {
    id,
    namespace: 'tasks',
    list: 'tasks',
  });
}

/**
 * Creates a new task.
 * @param {VuexStore} store
 * @param {import('@/store/modules/tasks').TaskState} data
 */
export async function createTask(store, data) {
  const id = await store.dispatch('tasks/create', data);
  return taskFromId(store, id);
}
