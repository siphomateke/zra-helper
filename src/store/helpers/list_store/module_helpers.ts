import Vue from 'vue';
import { mapObject, toPascalCase } from '@/utils';

// TODO: Document item getter functions better.

/**
 * Helper class to make it easier to create getters and mutations for Vuex
 * store modules that primarily deal with a single list of items.
 */
export default class ListStoreHelper {
  /**
   * @param {string} listName The key of the list in the state
   * @param {string} listItemName What to call the items. Used when providing arguments to getters
   * @param {string} singleItemGetterName Key of the getter that returns a single list item.
   */
  constructor(listName, listItemName, singleItemGetterName) {
    this.listName = listName;
    this.listItemName = listItemName;
    this.singleItemGetterName = singleItemGetterName;
  }

  // TODO: Fix this JSDoc
  /**
   * @typedef {Function} ListItemMutation
   * @param {Object} state
   * @param {Object} payload
   * @param {number} payload.id The ID of the list item to mutate.
   * @param {*} payload.value The payload of the mutation
   */

  /**
   * Creates mutations that set list item properties.
   *
   * The generated mutations names take the form 'set<property name>'. E.g. `setName`.
   * The generated mutations all take an ID and a value.
   * @param {*} props The names of the properties to generate mutations for.
   * @returns {Object.<string, ListItemMutation>}
   * @example
   * ...itemMutations(['name', 'brand'])
   * // returns `setName` and `setBrand` mutations.
   */
  itemMutations(props) {
    const mutations = {};
    for (const prop of props) {
      mutations[`set${toPascalCase(prop)}`] = (state, { id, value }) => {
        Vue.set(state[this.listName][id], prop, value);
      };
    }
    return mutations;
  }

  /**
   * Extends a basic getter to make it more suitable for list items.
   *
   * The extended getter will take a list item ID and will pass the
   * state, getters, list item and ID, all in one object, to the basic getter.
   * @param {*} getter
   * @returns {Function}
   */
  itemGetter(getter) {
    return (state, getters) => (id) => {
      const item = getters[this.singleItemGetterName](id);
      return getter({
        state,
        getters,
        [this.listItemName]: item,
        id,
      });
    };
  }

  /**
   * Generates multiple list item getters.
   * @param {*} getters
   * @returns {Object.<string, Function>}
   * @example
   * // if `listItemName` is 'item' and `singleItemGetterName` is 'list':
   * ...itemGetters({hasParent: ({ item }) => item.parent !== null,})
   * // returns the following object
   * {
   * hasParent: (state, getters) => (id) => {
   *   return getters['list'](id).parent !== null;
   * }
   * }
   */
  itemGetters(getters) {
    return mapObject(getters, getter => this.itemGetter(getter));
  }
}
