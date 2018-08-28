export default {
  state: {
    debug: false,
  },
  mutations: {
    setDebugMode(state, mode) {
      state.debug = mode;
    },
  },
};
