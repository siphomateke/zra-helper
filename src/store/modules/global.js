export default {
  state: {
    debug: false,
  },
  mutation: {
    setDebugMode(state, mode) {
      state.debug = mode;
    },
  },
};
