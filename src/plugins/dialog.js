import { errorToString } from '@/backend/errors';

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
      let message = '';
      if ('error' in options) {
        message = errorToString(options.error);
      } else if ('message' in options) {
        ({ message } = options);
      }
      this.$dialog.alert({
        title: options.title,
        message,
        hasIcon: true,
        type: 'is-danger',
      });
    };
  },
};
