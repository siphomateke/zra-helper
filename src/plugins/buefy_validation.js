export default {
  install(Vue) {
    Vue.prototype.$bFieldType = function $buefyFieldValidationType(fieldName) {
      return {
        'is-danger': this.$errors.has(fieldName),
      };
    };

    Vue.prototype.$bFieldValidationError = function $buefyFieldValidationError(fieldName) {
      return this.$errors.first(fieldName);
    };
  },
};
