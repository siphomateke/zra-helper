/**
 * Generates a mixin that syncs a particular component property with the components `value`
 * property. It also fires the `input` event whenever the property changes.
 * @param {string} name
 */
function generateValueSyncMixin(name) {
  return {
    watch: {
      value: {
        handler(value) {
          this[name] = value;
        },
        immediate: true,
      },
      [name](value) {
        this.$emit('input', value);
      },
    },
  };
}

export default generateValueSyncMixin;
