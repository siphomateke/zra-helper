import moment from 'moment';
import { ExtendedError } from '@/backend/errors';

export default {
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
    addLine(state, { content, type, category }) {
      state.lines.push({
        content,
        type,
        category: category || state.currentCategory,
        timestamp: moment().format('DD/MM/YY HH:mm:ss.SS'),
      });
    },
  },
  actions: {
    addLine({ commit, state, rootState }, payload) {
      commit('addLine', payload);

      if (rootState.global.debug) {
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
      let errorString = '';
      if (!(error instanceof Error) && error.message) {
        errorString = error.message;
      } else if (error instanceof ExtendedError) {
        errorString = `${error.type}: ${error.message}`;
      } else if (typeof error !== 'string') {
        errorString = error.toString();
      } else {
        errorString = `Error: ${error}`;
      }

      dispatch('addLine', {
        content: errorString,
        type: warning ? 'warning' : 'error',
      });

      if (rootState.global.debug) {
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
