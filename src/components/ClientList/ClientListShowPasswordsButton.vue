<template>
  <button
    :disabled="disabled"
    type="button"
    class="button"
    @click="show = !show">
    <span>{{ show ? 'Hide all passwords' : 'Show all passwords' }}</span>
    <b-icon
      :icon="show ? 'eye-slash' : 'eye'"
      size="is-small"/>
  </button>
</template>

<script>
export default {
  name: 'ClientListShowPasswordsButton',
  props: {
    value: {
      type: Boolean,
      default: null,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      show: false,
    };
  },
  watch: {
    value(value) {
      this.show = value;
    },
    show(value) {
      this.$emit('input', value);
    },
  },
  mounted() {
    this.show = this.value;
  },
};
</script>
