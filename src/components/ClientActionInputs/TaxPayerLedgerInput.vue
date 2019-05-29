<template>
  <div>
    <b-field
      :message="uploadFieldError"
      :type="uploadFieldType"
      label="Last week pending liability totals"
    >
      <FileUpload
        :disabled="disabled"
        @input="fileUploaded"
      />
    </b-field>
  </div>
</template>

<script>
import FileUpload from '@/components/BaseFileUpload.vue';
import ClientActionInputMixin from './mixin';
import { getExtension, loadFile } from '@/backend/file_utils';
import { csvOutputParser } from '@/backend/client_actions/pending_liabilities';
import { errorToString } from '@/backend/errors';

export default {
  name: 'ClientActionTaxPayerLedgerInput',
  components: {
    FileUpload,
  },
  mixins: [ClientActionInputMixin],
  props: {
    value: {
      type: Object,
      default: () => ({}),
    },
  },
  data() {
    return {
      uploadFieldError: null,
      uploadFieldType: '',
    };
  },
  methods: {
    async fileUploaded(file) {
      try {
        const fileExtension = getExtension(file.name);
        if (fileExtension !== 'csv') {
          throw new Error(`Pending liability totals file's extension must be '.csv' not '.${fileExtension}'.`);
        }
        const csvString = await loadFile(file);

        const pendingLiabilities = csvOutputParser(csvString);
        this.input.lastPendingLiabilities = pendingLiabilities;

        this.uploadFieldError = null;
        this.uploadFieldType = 'is-success';
      } catch (error) {
        this.uploadFieldError = errorToString(error);
        this.uploadFieldType = 'is-danger';
      }
    },
  },
};
</script>
