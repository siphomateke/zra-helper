interface ShowErrorFnOptions {
  title: string;
  error?: string;
  message?: string;
}

export default {
  install(Vue) {
    Vue.prototype.$showError = function $showError(options: ShowErrorFnOptions) {
      return this.$store.dispatch('showError', options);
    };
  },
};
