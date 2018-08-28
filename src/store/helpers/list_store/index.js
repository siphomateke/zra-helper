import { toPascalCase } from '@/utils';

/**
 * Gets a nested object property using a Vuex namespace.
 * @param {Object} obj
 * @param {string} namespace Vuex namespace
 */
function getByNamespace(obj, namespace) {
  const namespaces = namespace.split('/');
  return namespaces.reduce((accumulator, name) => accumulator[name], obj);
}

/**
 * Gets the state of a given namespace.
 * @param {Object} rootState
 * @param {string} namespace
 */
function getStateByNamespace(rootState, namespace) {
  return getByNamespace(rootState, namespace);
}

/**
 * Converts a namespace to the format that `store._modulesNamespaceMap` expects
 * @param {string} namespace The namespace to convert
 */
function normalizeNamespace(namespace) {
  if (typeof namespace === 'string' && namespace.charAt(namespace.length - 1) !== '/') {
    namespace += '/';
  }
  return namespace;
}

/**
 * Gets a store module by namespace.
 * @param {import('vuex').Store} store
 * @param {string} namespace
 */
function getModuleByNamespace(store, namespace) {
  // eslint-disable-next-line no-underscore-dangle
  return store._modulesNamespaceMap[normalizeNamespace(namespace)]._rawModule;
}

/**
 * @typedef ListItemStoreOptions
 * @property {string} namespace The namespace in which the list resides
 * @property {string} list The name of the list
 * @property {number} id The ID of the list item
 */

/**
 * A reference to the store that is scoped by a list item.
 */
export class ListItemStore {
  /**
   * @param {import('vuex').Store} store
   * @param {ListItemStoreOptions} options
   */
  constructor(store, { namespace, list, id }) {
    this.store = store;
    this.namespace = namespace;
    this.list = list;
    this.id = id;
    this.module = getModuleByNamespace(this.store, this.namespace);
  }
  getState() {
    return getStateByNamespace(this.store.state, this.namespace)[this.list][this.id];
  }
  propInState(prop) {
    return prop in this.getState();
  }
  propInGetters(prop) {
    return `${this.namespace}/${prop}` in this.store.getters;
  }
  propInActions(prop) {
    return prop in this.module.actions;
  }
  getStateByProp(prop) {
    return this.getState()[prop];
  }
  /**
   * Calls a getter using this list item's ID.
   * @param {string} prop
   */
  getters(prop) {
    return this.store.getters[`${this.namespace}/${prop}`](this.id);
  }
  /**
   * Commits a mutation with this list item's ID.
   * @param {string} prop
   * @param {*} value
   */
  commit(prop, value) {
    this.store.commit(`${this.namespace}/set${toPascalCase(prop)}`, { id: this.id, value });
  }
  /**
   * Dispatches an action with this list item's ID.
   * @param {string} prop
   * @param {Object} payload
   */
  dispatch(prop, payload) {
    return this.store.dispatch(`${this.namespace}/${prop}`, Object.assign({ id: this.id }, payload));
  }
  /**
   * Generates a dispatch function with a preset property.
   * Used in `listItemHandler` to re-assign a setter to an action.
   * @param {string} prop
   */
  getDispatchFunction(prop) {
    return payload => this.dispatch(prop, payload);
  }
}

/**
 * @param {import('vuex').Store} store
 * @param {ListItemStoreOptions} options
 */
export function getListItemStore(store, options) {
  const scopedStore = new ListItemStore(store, options);
  return new Proxy(scopedStore, {
    /**
     * @param {ListItemStore} obj
     * @param {string} prop
     */
    get(obj, prop) {
      if (typeof prop === 'string') {
        if (obj.propInGetters(prop)) {
          return obj.getters(prop);
        }
        if (obj.propInState(prop)) {
          return obj.getStateByProp(prop);
        }
        if (obj.propInActions(prop)) {
          return obj.getDispatchFunction(prop);
        }
      }
      return Reflect.get(...arguments); // eslint-disable-line prefer-rest-params
    },
    /**
     * @param {ListItemStore} obj
     * @param {string} prop
     * @param {*} value
     */
    set(obj, prop, value) {
      obj.commit(prop, value);
      return true;
    },
  });
}
