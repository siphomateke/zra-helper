<template>
  <div>
    <b-field grouped>
      <b-field
        :type="$bFieldType('previous_date')"
        :message="$bFieldValidationError('previous_date')"
        label="Previous date"
      >
        <DateInput
          v-validate="previousDateValidation"
          v-model="input.previousDate"
          :disabled="disabled"
          name="previous_date"
        />
      </b-field>
      <b-field
        :type="$bFieldType('previous_totals')"
        :message="$bFieldValidationError('previous_totals')"
        label="Previous pending liability totals"
      >
        <FileUpload
          v-validate="'required|ext:csv|pendingLiabilitiesFile'"
          :disabled="disabled"
          name="previous_totals"
          @input="previousTotalsUploaded"
        />
      </b-field>
    </b-field>
  </div>
</template>

<script>
import FileUpload from '@/components/BaseFileUpload.vue';
import DateInput from '@/components/fields/DateInput.vue';
import ClientActionInputMixin from './mixin';
import { loadFile } from '@/backend/file_utils';
import { csvOutputParser } from '@/backend/client_actions/pending_liabilities';

// FIXME: Decide how to display long error messages from pending liabilities validation
// TODO: Indicate that pending liabilities are in input despite the uploaded file no longer
// showing up after the input modal is closed.
export default {
  name: 'ClientActionPendingLiabilityChangeReasonsInput',
  components: {
    FileUpload,
    DateInput,
  },
  mixins: [ClientActionInputMixin],
  props: {
    value: {
      type: Object,
      default: () => ({}),
    },
  },
  computed: {
    previousDateValidation() {
      return {
        required: true,
        date_format: 'dd/MM/yyyy',
        before: [
          this.input.currentDate,
          true, // include current date
        ],
      };
    },
  },
  methods: {
    async previousTotalsUploaded(file) {
      try {
        const csvString = await loadFile(file);
        const totals = csvOutputParser(csvString);
        this.input.previousPendingLiabilities = totals;
      } catch (e) {
        // Errors are already handled during validation
        // TODO: Make sure there is zero possibility that a non-validation error could occur.
      }
    },
  },
};
</script>
