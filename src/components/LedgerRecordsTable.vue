<template>
  <b-table
    :data="records"
    :columns="columns"
    :mobile-cards="false"
    v-bind="$attrs"
    bordered
    narrowed
  />
</template>

<script>
import { ledgerTableColumns } from '@/backend/reports';
import { validateRecords } from '@/validation/props/ledgerRecord';

export default {
  name: 'LedgerRecordsTable',
  props: {
    records: {
      type: Array,
      default: () => [],
      validator: validateRecords,
    },
  },
  data() {
    return {
      columns: ledgerTableColumns.map(c => ({ ...c, sortable: true })),
    };
  },
};
</script>
