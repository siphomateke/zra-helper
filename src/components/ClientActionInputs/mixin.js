export default {
  data() {
    return {
      input: null,
    };
  },
  watch: {
    value: {
      handler(value) {
        this.input = value;
      },
      immediate: true,
    },
    input: {
      handler(value) {
        this.$emit('input', value);
      },
      deep: true,
    },
  },
};
