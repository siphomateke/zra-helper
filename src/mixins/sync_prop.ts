import Vue, { ComponentOptions } from 'vue';

/**
 * Generates a mixin that syncs a particular component property with the components `value`
 * property. It also fires the `input` event whenever the property changes.
 */
export function generateValueSyncMixin(name: string): ComponentOptions<Vue> {
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
 */
export function generatePropSyncMixin(
  internalProp: string,
  syncProp: string,
): ComponentOptions<Vue> {
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
