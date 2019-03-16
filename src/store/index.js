import Vue from 'vue';
import Vuex from 'vuex';
import config from './modules/config';
import tasks from './modules/tasks';
import log from './modules/log';

Vue.use(Vuex);

/** @type {import('vuex').StoreOptions} */
export const storeOptions = {
  modules: {
    config,
    tasks,
    log,
  },
  state: {
    zraLiteModeEnabled: false,
  },
  mutations: {
    setZraLiteMode(state, value) {
      state.zraLiteModeEnabled = value;
    },
  },
  actions: {
    async setZraLiteMode({ commit }, value) {
      await browser.runtime.sendMessage({ command: 'setZraLiteMode', mode: value });
      commit('setZraLiteMode', value);
    },
  },
  strict: process.env.NODE_ENV !== 'production',
};
export default new Vuex.Store(storeOptions);
