<template>
  <button
    class="button"
    type="button"
    @click="$emit('click')"
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
  props: {
    label: {
      type: String,
      default: '',
    },
  },
};
</script>
