import moment from 'moment';
import { ExtendedError, errorToString } from '@/backend/errors';
import { Module } from 'vuex';
import { RootState } from '../types';

export enum LogType {
  SUCCESS = 'success',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

export interface LogLine {
  content: string;
  type: LogType;
  category: string,
  /** Full timestamp */
  timestamp: string,
  /** Timestamp excluding the date. */
  timestampNoDate: string,
}

export namespace Log {
  export interface State {
    lines: LogLine[];
    currentCategory: string | null;
  }
}

// TODO: Add more documentation
const vuexModule: Module<Log.State, RootState> = {
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

      /* eslint-disable no-console */
      if (rootState.config.debug.logToConsole) {
        const text = `${payload.category || state.currentCategory}: ${payload.content}`;
        switch (payload.type) {
          case LogType.ERROR:
            console.error(text);
            break;
          case LogType.WARNING:
            console.warn(text);
            break;
          case LogType.INFO:
            console.info(text);
            break;
          default:
            console.log(text);
            break;
        }
      }
      /* eslint-enable no-console */
    },
    addErrorLine({ dispatch, rootState }, { error, warning = false }) {
      const errorString = errorToString(error);

      dispatch('addLine', {
        content: errorString,
        type: warning ? LogType.WARNING : LogType.ERROR,
      });

      /* eslint-disable no-console */
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
      /* eslint-enable no-console */
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
export default vuexModule;
