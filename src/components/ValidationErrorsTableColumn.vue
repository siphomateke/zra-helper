<template>
  <span :class="{'has-text-danger': errors.length>0}">{{ value }}</span>
</template>

<script>
export default {
  name: 'ValidationErrorsTableColumn',
  props: {
    row: {
      type: Object,
      default: null,
    },
    field: {
      type: String,
      default: '',
    },
  },
  computed: {
    valid() {
      return this.row.valid;
    },
    value() {
      return this.row[this.field];
    },
    errors() {
      if (!this.valid && this.field in this.row.fieldErrors) {
        return this.row.fieldErrors[this.field];
      }
      return [];
    },
  },
};
</script>
