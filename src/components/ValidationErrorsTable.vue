<template>
  <b-table
    :data="data"
    :mobile-cards="false"
    v-bind="$attrs"
    bordered
    narrowed
  >
    <template slot-scope="props">
      <b-table-column
        :sortable="true"
        field="valid"
        label="Valid"
        width="40"
      >
        <b-icon
          v-if="!props.row.valid"
          :title="invalidString"
          icon="exclamation-circle"
          size="is-small"
          type="is-danger"
        />
      </b-table-column>
      <b-table-column
        v-for="(column, index) in columns"
        :class="getCellClass(props.row, column)"
        :data-tooltip="getCellTooltip(props.row, column)"
        :key="index"
        :label="column.label"
        :field="column.field"
        :sortable="true"
        class="is-tooltip-multiline"
      >
        <ValidationErrorsTableColumn
          :row="props.row"
          :field="column.field"
        />
      </b-table-column>
    </template>
  </b-table>
</template>

<script>
import ValidationErrorsTableColumn from './ValidationErrorsTableColumn.vue';

export default {
  name: 'ValidationErrorsTable',
  components: {
    ValidationErrorsTableColumn,
  },
  props: {
    // TODO: Add validators
    data: {
      type: Array,
      required: true,
      // TODO: Use TypeScript to vaidate this
      // Each row must have a `fieldErrors` item that contains the errors for each field.
      // A key in fieldErrors should be set for each item regardless of if they have any errors
    },
    columns: {
      type: Array,
      required: true,
    },
    /** String used to describe that a row is invalid. */
    invalidString: {
      type: String,
      default: 'This row is invalid',
    },
  },
  methods: {
    cellHasErrors(row, column) {
      if (row.fieldErrors && column.field in row.fieldErrors) {
        const errors = row.fieldErrors[column.field];
        if (errors.length > 0) {
          return true;
        }
      }
      return false;
    },
    getCellClass(row, column) {
      if (this.cellHasErrors(row, column)) {
        return ['has-error', 'tooltip', 'is-tooltip-danger'];
      }
      return [];
    },
    getCellErrorMessages(errors) {
      return errors.join('\n\n');
    },
    getCellTooltip(row, column) {
      if (this.cellHasErrors(row, column)) {
        const errors = row.fieldErrors[column.field];
        return this.getCellErrorMessages(errors);
      }
      return '';
    },
  },
};
</script>

<style lang="scss" scoped>
/* TODO: Make error cell background color a variable */
@import 'styles/variables.scss';

.table td.has-error {
  background-color: lighten($danger, 35%);

  &:hover {
    cursor: help;
    background-color: lighten($danger, 30%);
  }
}
</style>
