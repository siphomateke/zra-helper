<template>
  <span :class="{'has-text-danger': errors.length>0}">{{ value }}</span>
</template>

<script>
export default {
  name: 'ParsedClientsViewerColumn',
  props: {
    row: {
      type: Object,
      default: null,
    },
    prop: {
      type: String,
      default: '',
    },
  },
  computed: {
    valid() {
      return this.row.valid;
    },
    value() {
      return this.row[this.prop];
    },
    errors() {
      if (!this.valid) {
        return this.row.propErrors[this.prop];
      }
      return [];
    },
  },
};
</script>
