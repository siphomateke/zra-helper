// TODO: Consider moving papa parse handling here
// TODO: Support multiple outputs
/** @type {import('vuex').Module} */
const module = {
  namespaced: true,
  state: {
    rows: [],
  },
  getters: {
    content: state => state.rows.join('\n'),
  },
  mutations: {
    addRow(state, row) {
      state.rows.push(row);
    },
  },
  actions: {
    /**
     * Adds a new row to the output.
     * @param {import('vuex').ActionContext} context
     * @param {string} row
     */
    addRow({ commit }, row) {
      commit('addRow', row);
    },
  },
};
export default module;
