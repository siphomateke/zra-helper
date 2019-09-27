<template>
  <button
    :class="[size]"
    :title="description"
    :disabled="disabled"
    v-bind="$attrs"
    class="button"
    type="button"
    @click="$emit('click')"
  >
    <slot name="label">
      <b-icon
        :icon="icon"
        size="is-small"
      />
      <span v-if="!compact">{{ label }}</span>
    </slot>
    <slot />
  </button>
</template>

<script>
export default {
  props: {
    label: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    icon: {
      type: String,
      required: true,
    },
    compact: {
      type: Boolean,
      default: false,
    },
    size: {
      type: String,
      default: '',
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
};
</script>
