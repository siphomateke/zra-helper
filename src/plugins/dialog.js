export default {
  install(Vue) {
    /**
     *
     * @param {Object} options
     * @param {string} options.title
     * @param {string} [options.error]
     * @param {string} [options.message]
     */
    Vue.prototype.$showError = function $showError(options) {
      return this.$store.dispatch('showError', options);
    };
  },
};
