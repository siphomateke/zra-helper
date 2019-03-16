import Vue from 'vue';
import store from '@/store';
import { getTaxAccounts } from '@/backend/client_actions/utils';
import ListStoreHelper from '@/store/helpers/list_store/module_helpers';

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

const listStoreHelper = new ListStoreHelper('all', 'client', 'getClientById');

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
        taxAccounts: null,
        registeredTaxAccounts: null,
      }, payload));
      lastClientId++;
    },
    clear(state) {
      state.all = {};
    },
    ...listStoreHelper.itemMutations([
      'taxTypes',
      'taxAccounts',
      'registeredTaxAccounts',
    ]),
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
     * Gets the tax accounts a client has. This includes registered tax types.
     * @param {ActionContext} context
     * @param {Object} payload
     * @param {number} payload.id ID of the client
     * @param {number} payload.parentTaskId
     * ID of a logged in tab to use to navigate to the tax payer profile.
     * @returns {Promise.<import('@/backend/client_actions/utils').TaxAccount[]>}
     */
    async getTaxAccounts({ commit, getters }, { id, parentTaskId }) {
      const client = getters.getClientById(id);
      if (!client.taxAccounts) {
        const taxAccounts = await getTaxAccounts({ store, parentTaskId, tpin: client.username });
        commit('setTaxAccounts', { id, value: taxAccounts });

        const registeredTaxAccounts = taxAccounts.filter(account => account.status === 'registered');
        commit('setRegisteredTaxAccounts', { id, value: registeredTaxAccounts });

        const taxTypes = registeredTaxAccounts.map(account => account.taxTypeId);
        commit('setTaxTypes', { id, value: taxTypes });

        return taxAccounts;
      }
      return client.taxAccounts;
    },
  },
};
export default module;
