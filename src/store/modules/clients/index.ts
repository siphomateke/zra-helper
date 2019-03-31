import Vue from 'vue';
import store from '@/store';
import { getTaxAccounts } from '@/backend/client_actions/utils';
import ListStoreHelper from '@/store/helpers/list_store/module_helpers';
import { ParsedClient } from '@/backend/constants';
import { Module } from 'vuex';
import { RootState } from '@/store/types';
import { ClientsState } from './types';

let lastClientId: number = 0;

const listStoreHelper = new ListStoreHelper('all', 'client', 'getClientById');

const module: Module<ClientsState, RootState> = {
  namespaced: true,
  state: {
    all: {},
  },
  getters: {
    getClientById: state => (id: number) => state.all[id],
  },
  mutations: {
    add(state, payload: ParsedClient) {
      Vue.set(
        state.all,
        lastClientId,
        Object.assign(
          {
            id: lastClientId,
            taxTypes: [],
            taxAccounts: [],
            registeredTaxAccounts: [],
          },
          payload
        )
      );
      lastClientId++;
    },
    clear(state) {
      state.all = {};
    },
    ...listStoreHelper.itemMutations(['taxTypes', 'taxAccounts', 'registeredTaxAccounts']),
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

        const registeredTaxAccounts = taxAccounts.filter(
          account => account.status === 'registered'
        );
        commit('setRegisteredTaxAccounts', { id, value: registeredTaxAccounts });

        const taxTypes = [];
        for (const account of registeredTaxAccounts) {
          if (!taxTypes.includes(account.taxTypeId)) {
            taxTypes.push(account.taxTypeId);
          }
        }
        commit('setTaxTypes', { id, value: taxTypes });

        return taxAccounts;
      }
      return client.taxAccounts;
    },
  },
};
export default module;
