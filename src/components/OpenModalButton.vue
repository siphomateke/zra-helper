<template>
  <button
    v-bind="$attrs"
    class="button"
    type="button"
    v-on="$listeners"
  >
    <span v-if="label">{{ label }}</span>
    <slot/>
    <b-icon
      icon="angle-right"
      size="is-small"
    />
  </button>
</template>

<script>
export default {
  name: 'OpenModalButton',
  inheritAttrs: false,
  props: {
    label: {
      type: String,
      default: '',
    },
  },
};
</script>
