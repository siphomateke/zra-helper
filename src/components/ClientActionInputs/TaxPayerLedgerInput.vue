<template>
  <div>
    <b-field label="Last week pending liability totals">
      <FileUpload
        :disabled="disabled"
        @input="fileUploaded"
      />
    </b-field>
  </div>
</template>

<script>
import DateRangeInput from '@/components/fields/DateRangeInput.vue';
import FileUpload from '@/components/BaseFileUpload.vue';
import ClientActionInputMixin from './mixin';
import { loadCsvFile } from '@/backend/file_utils';
import { csvOutputParser } from '@/backend/client_actions/pending_liabilities';

export default {
  name: 'ClientActionTaxPayerLedgerInput',
  components: {
    DateRangeInput,
    FileUpload,
  },
  mixins: [ClientActionInputMixin],
  props: {
    value: {
      type: Object,
      default: () => ({}),
    },
  },
  methods: {
    async fileUploaded(file) {
      const csvString = await loadCsvFile(file);

      const pendingLiabilities = csvOutputParser(csvString);
      this.input.lastPendingLiabilities = pendingLiabilities;
    },
  },
};
</script>
