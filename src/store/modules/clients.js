import Vue from 'vue';

let lastClientId = 0;

/**
 * @typedef {import('vuex').ActionContext} ActionContext
 * @typedef {import('@/backend/constants').Client} Client
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
     * @param {Client} payload
     */
    add(state, payload) {
      Vue.set(state.all, lastClientId, Object.assign({
        id: lastClientId,
      }, payload));
      lastClientId++;
    },
    clear(state) {
      state.all = {};
    },
  },
  actions: {
    /**
     * Updates the list of clients.
     * @param {ActionContext} context
     * @param {Client[]} clients
     */
    update({ commit }, clients) {
      commit('clear');
      for (const client of clients) {
        commit('add', client);
      }
    },
  },
};
export default module;
