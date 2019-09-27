import { toPascalCase } from '@/utils';
import { RootState } from '@/store/types';
import { Store } from 'vuex';

/**
 * Gets a nested object property using a Vuex namespace.
 * @param namespace Vuex namespace
 */
function getByNamespace(obj: RootState, namespace: string) {
  const namespaces = namespace.split('/');
  return namespaces.reduce((accumulator, name) => accumulator[name], obj);
}

/**
 * Gets the state of a given namespace.
 * @param rootState
 * @param namespace
 */
function getStateByNamespace(rootState: RootState, namespace: string) {
  return getByNamespace(rootState, namespace);
}

/**
 * Converts a namespace to the format that `store._modulesNamespaceMap` expects
 * @param namespace The namespace to convert
 */
function normalizeNamespace(namespace: string): string {
  if (typeof namespace === 'string' && namespace.charAt(namespace.length - 1) !== '/') {
    namespace += '/';
  }
  return namespace;
}

/**
 * Gets a store module by namespace.
 */
function getModuleByNamespace<S>(store: Store<S>, namespace: string) {
  // eslint-disable-next-line no-underscore-dangle
  return store._modulesNamespaceMap[normalizeNamespace(namespace)]._rawModule;
}

interface ListItemStoreOptions {
  /** The namespace in which the list resides */
  namespace: string;
  /** The name of the list */
  list: string;
  /** The ID of the list item */
  id: number;
}

/**
 * A reference to the store that is scoped by a list item.
 */
export class ListItemStore<S> {
  // TODO: Don't duplicate this in `ListItemStoreOptions`
  namespace: string;

  list: string;

  id: number;

  // FIXME: Find out what type this should be
  module: any;

  constructor(public store: Store<S>, { namespace, list, id }: ListItemStoreOptions) {
    this.namespace = namespace;
    this.list = list;
    this.id = id;
    this.module = getModuleByNamespace(this.store, this.namespace);
  }

  getState() {
    return getStateByNamespace(this.store.state, this.namespace)[this.list][this.id];
  }

  propInState(prop: string) {
    return prop in this.getState();
  }

  propInGetters(prop: string) {
    return `${this.namespace}/${prop}` in this.store.getters;
  }

  propInActions(prop: string) {
    return prop in this.module.actions;
  }

  getStateByProp(prop: string) {
    return this.getState()[prop];
  }

  /**
   * Calls a getter using this list item's ID.
   */
  getters(prop: string) {
    return this.store.getters[`${this.namespace}/${prop}`](this.id);
  }

  /**
   * Commits a mutation with this list item's ID.
   */
  commit(prop: string, value: any) {
    this.store.commit(`${this.namespace}/set${toPascalCase(prop)}`, { id: this.id, value });
  }

  /**
   * Dispatches an action with this list item's ID.
   */
  dispatch(prop: string, payload: object) {
    return this.store.dispatch(
      `${this.namespace}/${prop}`,
      Object.assign({ id: this.id }, payload),
    );
  }

  /**
   * Generates a dispatch function with a preset property.
   * Used in `listItemHandler` to re-assign a setter to an action.
   */
  getDispatchFunction(prop: string) {
    return (payload: any) => this.dispatch(prop, payload);
  }
}

// FIXME: Type this properly
export function getListItemStore<S>(store: Store<S>, options: ListItemStoreOptions) {
  const scopedStore = new ListItemStore(store, options);
  return new Proxy(scopedStore, {
    get(obj: ListItemStore, prop: string) {
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
    set(obj: ListItemStore, prop: string, value: any) {
      obj.commit(prop, value);
      return true;
    },
  });
}
