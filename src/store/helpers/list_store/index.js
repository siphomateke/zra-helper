import store, { storeOptions } from '@/store';
import { toPascalCase } from '@/utils';

/**
 * Gets a nested object property using a Vuex namespace.
 * @param {string} namespace Vuex namespace
 * @param {Object} obj
 */
function getByNamespace(namespace, obj) {
  const namespaces = namespace.split('/');
  return namespaces.reduce((accumulator, name) => accumulator[name], obj);
}

/**
 * Gets the state of a given namespace.
 * @param {string} namespace
 */
function getStateByNamespace(namespace) {
  return getByNamespace(namespace, store.state);
}

/**
 * Gets a store module by namespace.
 * @param {string} namespace
 */
function getModuleByNamespace(namespace) {
  return getByNamespace(namespace, storeOptions.modules);
}

/**
 * A reference to the store that is scoped by a list item.
 */
export class ListItemStore {
  /**
   * @param {Object} options
   * @param {string} options.namespace The namespace in which the list resides
   * @param {string} options.list The name of the list
   * @param {number} options.id The ID of the list item
   */
  constructor({ namespace, list, id }) {
    this.namespace = namespace;
    this.list = list;
    this.id = id;
    this.module = getModuleByNamespace(this.namespace);
  }
  getState() {
    return getStateByNamespace(this.namespace)[this.list][this.id];
  }
  propInState(prop) {
    return prop in this.getState();
  }
  propInGetters(prop) {
    return `${this.namespace}/${prop}` in store.getters;
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
    return store.getters[`${this.namespace}/${prop}`](this.id);
  }
  /**
   * Commits a mutation with this list item's ID.
   * @param {string} prop
   * @param {*} value
   */
  commit(prop, value) {
    store.commit(`${this.namespace}/set${toPascalCase(prop)}`, { id: this.id, value });
  }
  /**
   * Dispatches an action with this list item's ID.
   * @param {string} prop
   * @param {Object} payload
   */
  dispatch(prop, payload) {
    return store.dispatch(`${this.namespace}/${prop}`, Object.assign({ id: this.id }, payload));
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

export function getListItemStore(options) {
  const scopedStore = new ListItemStore(options);
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
