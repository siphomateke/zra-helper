/**
 * Generates a mixin that syncs a particular component property with the components `value`
 * property. It also fires the `input` event whenever the property changes.
 * @param {string} name
 * @returns {import('vue').ComponentOptions}
 */
export function generateValueSyncMixin(name) {
  return {
    data() {
      return {
        [name]: this.value,
      };
    },
    watch: {
      value(value) {
        this[name] = value;
      },
      [name](value) {
        this.$emit('input', value);
      },
    },
  };
}

/**
 * Generates a mixin that syncs a components data property with a prop.
 * @param {string} internalProp
 * @param {string} syncProp
 * @returns {import('vue').ComponentOptions}
 */
export function generatePropSyncMixin(internalProp, syncProp) {
  return {
    data() {
      return {
        [internalProp]: this[syncProp],
      };
    },
    watch: {
      [syncProp](value) {
        this[internalProp] = value;
      },
      [internalProp](value) {
        this.$emit(`update:${syncProp}`, value);
      },
    },
  };
}
