import Vue from 'vue';
import store from '@/store';
import { getTaxTypes } from '@/backend/client_actions/utils';

let lastClientId = 0;

/**
 * @typedef {import('vuex').ActionContext} ActionContext
 * @typedef {import('@/backend/constants').Client} Client
 * @typedef {import('@/backend/constants').ParsedClient} ParsedClient
 */

/**
 * @typedef {Object} State
 * @property {Object.<string, Client>} all
 */

/** @type {import('vuex').Module} */
const module = {
  namespaced: true,
  /** @type {State} */
  state: {
    all: {},
  },
  getters: {
    getClientById: state => id => state.all[id],
  },
  mutations: {
    /**
     *
     * @param {State} state
     * @param {ParsedClient} payload
     */
    add(state, payload) {
      Vue.set(state.all, lastClientId, Object.assign({
        id: lastClientId,
        taxTypes: null,
      }, payload));
      lastClientId++;
    },
    clear(state) {
      state.all = {};
    },
    setTaxTypes(state, { id, taxTypes }) {
      Vue.set(state.all[id], 'taxTypes', taxTypes);
    },
  },
  actions: {
    /**
     * Updates the list of clients.
     * @param {ActionContext} context
     * @param {ParsedClient[]} clients
     */
    update({ commit }, clients) {
      commit('clear');
      for (const client of clients) {
        commit('add', client);
      }
    },
    /**
     * Gets and sets the tax types that this client has registered.
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {number} payload.id ID of client to get tax types for.
     * @param {number} payload.parentTaskId
     * @param {number} payload.loggedInTabId ID of a logged in tab to use to navigate to the tax payer profile.
     */
    async getTaxTypes({ state, commit }, { id, parentTaskId, loggedInTabId }) {
      const client = state.all[id];
      if (!client.taxTypes) {
        const taxTypes = await getTaxTypes({ store, parentTaskId, loggedInTabId });
        commit('setTaxTypes', { id, taxTypes });
        return taxTypes;
      }
      return client.taxTypes;
    },
  },
};
export default module;
