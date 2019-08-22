import Vue from 'vue';
import Vuex from 'vuex';
import config from './modules/config';
import tasks from './modules/tasks';
import log from './modules/log';
import { getPlatformEol } from '@/backend/file_utils';

Vue.use(Vuex);

/**
 * @typedef {Object} RootState
 * @property {boolean} zraLiteModeEnabled
 * @property {import('@/backend/file_utils').EolCharacter} eol
 * End of line character to use in exports.
 * @property {boolean} configIsLoading
 */

/** @type {import('vuex').StoreOptions<RootState>} */
export const storeOptions = {
  modules: {
    config,
    tasks,
    log,
  },
  state: {
    zraLiteModeEnabled: false,
    eol: null,
    configIsLoading: false,
  },
  mutations: {
    setZraLiteMode(state, value) {
      state.zraLiteModeEnabled = value;
    },
    setEol(state, value) {
      state.eol = value;
    },
    setConfigLoadingState(state, value) {
      state.configIsLoading = value;
    },
  },
  actions: {
    async setZraLiteMode({ commit }, value) {
      await browser.runtime.sendMessage({ command: 'setZraLiteMode', mode: value });
      commit('setZraLiteMode', value);
    },
    /**
     * Determines the end of line character to use based on the config.
     */
    async updateEolCharacter({ state, commit }) {
      let char = '';
      switch (state.config.export.eol) {
        case 'auto':
          char = await getPlatformEol();
          break;
        case 'CRLF':
          char = '\r\n';
          break;
        default:
          char = '\n';
          break;
      }
      commit('setEol', char);
    },
  },
  strict: process.env.NODE_ENV !== 'production',
};
export default new Vuex.Store(storeOptions);
