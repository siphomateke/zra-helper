<template>
  <div>
    <div class="buttons">
      <OpenModalButton
        label="View all ledger records"
        @click="modalsVisible.records = true"
      />
      <OpenModalButton
        v-if="response.invalidRecords.length > 0"
        label="View invalid ledger records"
        class="is-warning"
        @click="modalsVisible.invalidRecords = true"
      />
    </div>

    <CardModal
      :active.sync="modalsVisible.records"
      :scrollable="true"
      title="Ledger records"
    >
      <LedgerRecordsTable
        slot="body"
        :records="response.taxPayerLedgerRecords"
      />
    </CardModal>
    <CardModal
      :active.sync="modalsVisible.invalidRecords"
      :scrollable="true"
      title="Ledger records"
    >
      <div slot="body">
        <InvalidLedgerRecords
          :records="response.taxPayerLedgerRecords"
          :invalid-records="response.invalidRecords"
        />
      </div>
      <div slot="foot" />
    </CardModal>

    <ul
      v-if="response.processingErrors.length > 0"
      class="bulleted-list"
    >
      <li
        v-for="(error, index) of response.processingErrors"
        :key="index"
      >
        <span class="has-text-danger">{{ error.message }}</span>
      </li>
    </ul>
  </div>
</template>

<script>
import OpenModalButton from '@/components/OpenModalButton.vue';
import CardModal from '@/components/CardModal.vue';
import InvalidLedgerRecords from './InvalidLedgerRecords.vue';
import LedgerRecordsTable from '@/components/LedgerRecordsTable.vue';
import { objectHasProperties } from '@/utils';

// TODO: Show records mentioned in processing errors in a modal or something
export default {
  name: 'LedgerLogicResponse',
  components: {
    OpenModalButton,
    CardModal,
    InvalidLedgerRecords,
    LedgerRecordsTable,
  },
  props: {
    response: {
      // TODO: TypeScript:
      // import('@/backend/client_actions/tax_payer_ledger/logic').TaxPayerLedgerLogicFnResponse
      type: Object,
      required: true,
      validator(value) {
        const { missing } = objectHasProperties(value, [
          'changeReasonsByLiability',
          'processingErrors',
          'invalidRecords',
          'taxPayerLedgerRecords',
        ]);
        if (missing.length > 0) return false;

        const conditions = [
          Array.isArray(value.processingErrors),
          Array.isArray(value.invalidRecords),
          Array.isArray(value.taxPayerLedgerRecords),
        ];
        // TODO: Consider if it's worth validating all the array items. E.g. each ledger record.
        return !conditions.includes(false);
      },
    },
  },
  data() {
    return {
      modalsVisible: {
        records: false,
        invalidRecords: false,
      },
    };
  },
};
</script>
