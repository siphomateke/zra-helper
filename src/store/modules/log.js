import { ExtendedError } from '@/errors';

function getTimeStamp() {
  const now = new Date(Date.now());
  const dateValues = [
    now.getDate(),
    now.getMonth(),
    now.getFullYear(),
  ];
  const date = dateValues.map(val => val.toString().padStart(2, '0')).join('/');
  let times = [
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  ];
  times = times.map(val => val.toString().padStart(2, '0'));
  let time = times.join(':');
  time = `${time}.${now.getMilliseconds().toString().padStart(3, '0')}`;
  return `${date} ${time}`;
}

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
        timestamp: getTimeStamp(),
      });
    },
  },
  actions: {
    addLine({ commit, state, rootState }, payload) {
      commit('addLine', payload);

      if (rootState.debug) {
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

      if (rootState.debug && error instanceof Error) {
        if (error instanceof ExtendedError) {
          console.groupCollapsed(`${error.type} Details`);
          console.log(error.stack);
          console.log({
            code: error.code,
            message: error.message,
            type: error.type,
            props: error.props,
          });
          console.groupEnd();
        } else {
          console.error(error);
        }
      }
    },
  },
};
