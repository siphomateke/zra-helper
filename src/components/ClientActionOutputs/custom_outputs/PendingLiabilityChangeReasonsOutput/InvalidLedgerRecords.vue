<template>
  <div>
    <b-checkbox v-model="internalInvalidOnly">Only show invalid records</b-checkbox>
    <ValidationErrorsTable
      :data="filteredData"
      :columns="columns"
      invalid-string="This record is invalid."
    />
  </div>
</template>

<script>
import ValidationErrorsTable from '@/components/ValidationErrorsTable.vue';
import { ledgerTableColumns } from '@/backend/reports';
import { generatePropSyncMixin } from '@/mixins/sync_prop';
import { validateRecords } from '@/validation/props/ledgerRecord';

export default {
  name: 'InvalidLedgerRecords',
  components: {
    ValidationErrorsTable,
  },
  mixins: [generatePropSyncMixin('internalInvalidOnly', 'invalidOnly')],
  props: {
    records: {
      type: Array,
      default: () => [],
      validator: validateRecords,
    },
    invalidRecords: {
      type: Array,
      default: () => [],
      // TODO: Validate
      // TypeScript:
      // ('@/backend/client_actions/tax_payer_ledger/record_validation').ParsedRecordValidation
    },
    /** Whether only the invalid records should be shown. */
    invalidOnly: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      columns: ledgerTableColumns,
    };
  },
  computed: {
    data() {
      return this.records.map((record) => {
        // eslint-disable-next-line max-len
        /** @type {import('@/backend/client_actions/tax_payer_ledger/record_validation').ParsedRecordValidation} */
        const validation = this.invalidRecords.find(r => r.srNo === record.srNo);
        let valid = true;
        let fieldErrors = {};
        if (validation) {
          valid = false;
          const valueErrors = [];
          if (validation.multipleValueColumns) {
            valueErrors.push("Record's can't have values in both debit and credit.");
          }
          if (validation.invalidValueColumn) {
            valueErrors.push(`This record's value should be in ${validation.expectedValueColumn} based on its narration type and reversal state.`);
          }
          fieldErrors = {
            narration: validation.narrationValidation.errors,
            debit: valueErrors,
            credit: valueErrors,
          };
        }
        return {
          ...record,
          valid,
          fieldErrors,
        };
      });
    },
    filteredData() {
      let filtered = this.data;
      if (this.internalInvalidOnly) {
        filtered = filtered.filter(r => !r.valid);
      }
      return filtered;
    },
  },
};
</script>
