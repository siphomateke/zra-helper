<template>
  <b-table
    :data="clients"
    :mobile-cards="false"
    bordered
    narrowed>
    <template slot-scope="props">
      <b-table-column
        :sortable="true"
        field="valid"
        label="Valid"
        width="40">
        <b-icon
          v-if="!props.row.valid"
          icon="exclamation-circle"
          size="is-small"
          type="is-danger"
          title="This client is invalid."/>
      </b-table-column>
      <b-table-column
        v-for="(column, index) in columns"
        :class="getCellClass(props.row, column)"
        :data-tooltip="getCellTooltip(props.row, column)"
        :key="index"
        :label="column.label"
        :field="column.field"
        :sortable="true">
        <ClientListTableColumn
          :row="props.row"
          :prop="column.field"/>
      </b-table-column>
    </template>
  </b-table>
</template>

<script>
import { clientPropValidationErrorMessages } from '@/backend/constants';
import ClientListTableColumn from './ClientListTableColumn.vue';

export default {
  name: 'ClientListTable',
  components: {
    ClientListTableColumn,
  },
  props: {
    clients: {
      type: Array,
      default: () => [],
      required: true,
    },
  },
  data() {
    return {
      columns: [
        { field: 'name', label: 'Name' },
        { field: 'username', label: 'Username' },
        { field: 'password', label: 'Password' },
      ],
    };
  },
  methods: {
    cellHasErrors(row, column) {
      if (row.propErrors && column.field in row.propErrors) {
        const errors = row.propErrors[column.field];
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
    getErrorMessageFromCode(code) {
      if (code in clientPropValidationErrorMessages) {
        return clientPropValidationErrorMessages[code];
      }
      return 'Unknown error';
    },
    getCellErrorMessages(errors) {
      return errors.map(code => this.getErrorMessageFromCode(code)).join(',');
    },
    getCellTooltip(row, column) {
      if (this.cellHasErrors(row, column)) {
        const errors = row.propErrors[column.field];
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
