import Vue from 'vue';
import store from '@/store';
import { getTaxAccounts } from '@/backend/client_actions/utils';
import ListStoreHelper from '@/store/helpers/list_store/module_helpers';
import { taxTypes, ParsedClient } from '@/backend/constants';
import { InvalidTaxType } from '@/backend/errors';
import { Module } from 'vuex';
import { RootState } from '@/store/types';
import { ClientsState } from './types';

let lastClientId: number = 0;

const listStoreHelper = new ListStoreHelper('all', 'client', 'getClientById');

const vuexModule: Module<ClientsState, RootState> = {
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
            taxTypes: null,
            taxAccounts: null,
            registeredTaxAccounts: null,
          },
          payload,
        ),
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
          account => account.status === 'active',
        );
        commit('setRegisteredTaxAccounts', { id, value: registeredTaxAccounts });

        const taxTypeIds = [];
        for (const account of registeredTaxAccounts) {
          const { taxTypeId } = account;
          if (taxTypeId in taxTypes) {
            if (!taxTypeIds.includes(taxTypeId)) {
              taxTypeIds.push(taxTypeId);
            }
          } else {
            throw new InvalidTaxType(`Invalid tax type ID: ${taxTypeId}`);
          }
        }
        commit('setTaxTypes', { id, value: taxTypeIds });

        return taxAccounts;
      }
      return client.taxAccounts;
    },
  },
};
export default vuexModule;

/**
 * @typedef {Object} GetUniqueClientsFnResponse
 * @property {Client[]} uniqueClients
 * @property {string[]} invalidUsernames Usernames with multiple passwords.
 * @property {Client[]} invalidClients
 * Duplicate clients that were removed for having different passwords.
 */

/**
 * Removes duplicate clients from an array of clients. Only duplicate clients with the same
 * password are removed. Those that have different passwords are removed entirely and returned.
 * @param {Client[]} clients
 * @returns {GetUniqueClientsFnResponse}
 */
export function getUniqueClients(clients) {
  const unique = new Map();
  const invalidUsernames = [];
  const invalidClients = {};
  for (const client of clients) {
    if (!unique.has(client.username)) {
      unique.set(client.username, client);
    } else {
      // Make sure the clients' passwords are the same
      const existingClient = unique.get(client.username);
      if (client.password !== existingClient.password) {
        if (!invalidUsernames.includes(client.username)) {
          invalidUsernames.push(client.username);
        }

        // Both clients are invalid
        if (!(existingClient.id in invalidClients)) {
          invalidClients[existingClient.id] = existingClient;
        }
        if (!(client.id in invalidClients)) {
          invalidClients[client.id] = client;
        }
      }
    }
  }
  for (const username of invalidUsernames) {
    unique.delete(username);
  }
  const uniqueClients = Array.from(unique.values());
  return {
    uniqueClients,
    invalidUsernames,
    invalidClients: Object.values(invalidClients),
  };
}
