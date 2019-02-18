import moment from 'moment';
import { ExtendedError, errorToString } from '@/backend/errors';

/** @typedef {string} LogType */

/** @enum {LogType} */
export const logTypes = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

// TODO: Add more documentation
/** @type {import('vuex').Module} */
const module = {
  namespaced: true,
  state: {
    lines: [],
    currentCategory: null,
  },
  getters: {
    empty: state => state.lines.length === 0,
  },
  mutations: {
    setCategory(state, category) {
      state.currentCategory = category;
    },
    /**
     * Adds a new line to the log.
     * @param {any} state
     * @param {Object} payload
     * @param {string} payload.content The actual message in the log.
     * @param {LogType} payload.type
     * @param {string} payload.category
     */
    addLine(state, { content, type, category }) {
      const time = moment();
      state.lines.push({
        content,
        type,
        category: category || state.currentCategory,
        timestamp: time.format('DD/MM/YY HH:mm:ss.SS'),
        timestampNoDate: time.format('HH:mm:ss.SS'),
      });
    },
  },
  actions: {
    /**
     * Adds a new line to the log.
     * @param {import('vuex').ActionContext} context
     * @param {Object} payload
     * @param {string} payload.content The actual message in the log.
     * @param {LogType} payload.type
     * @param {string} payload.category
     */
    addLine({ commit, state, rootState }, payload) {
      commit('addLine', payload);

      if (rootState.config.debug.logToConsole) {
        const text = `${payload.category || state.currentCategory}: ${payload.content}`;
        switch (payload.type) {
          case 'error':
            console.error(text);
            break;
          case 'warning':
            console.warn(text);
            break;
          case 'info':
            console.info(text);
            break;
          default:
            console.log(text);
            break;
        }
      }
    },
    addErrorLine({ dispatch, rootState }, { error, warning = false }) {
      const errorString = errorToString(error);

      dispatch('addLine', {
        content: errorString,
        type: warning ? 'warning' : 'error',
      });

      if (rootState.config.debug.errors) {
        if (error instanceof ExtendedError) {
          console.groupCollapsed(`${error.type} Details`);
          console.log(error.error.stack);
          console.log({
            code: error.code,
            message: error.message,
            type: error.type,
            props: error.props,
          });
          console.groupEnd();
        } else if (error instanceof Error) {
          console.error(error);
        }
      }
    },
    log({ dispatch }, content) {
      return dispatch('addLine', {
        content,
        type: '',
        category: '',
      });
    },
    setCategory({ commit }, category) {
      commit('setCategory', category);
    },
  },
};
export default module;
