import Vue from 'vue';
import Vuex from 'vuex';
import { Dialog } from 'buefy/dist/components/dialog';
import config from './modules/config';
import tasks from './modules/tasks';
import log from './modules/log';
import { getPlatformEol } from '@/backend/file_utils';
import { errorToString } from '@/backend/errors';

Vue.use(Vuex);

/**
 * @typedef {Object} RootState
 * @property {boolean} zraLiteModeEnabled
 * @property {import('@/backend/file_utils').EolCharacter} eol
 * End of line character to use in exports.
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
  },
  mutations: {
    setZraLiteMode(state, value) {
      state.zraLiteModeEnabled = value;
    },
    setEol(state, value) {
      state.eol = value;
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
    /**
     *
     * @param {Object} options
     * @param {string} options.title
     * @param {string} [options.error]
     * @param {string} [options.message]
     */
    showError(_ctx, options) {
      let message = '';
      if ('error' in options) {
        message = errorToString(options.error);
      } else if ('message' in options) {
        ({ message } = options);
      }
      Dialog.alert({
        title: options.title,
        message,
        hasIcon: true,
        type: 'is-danger',
        iconPack: 'fas', // FIXME: Use default icon pack defined in vue_init
      });
    },
  },
  strict: process.env.NODE_ENV !== 'production',
};
export default new Vuex.Store(storeOptions);
