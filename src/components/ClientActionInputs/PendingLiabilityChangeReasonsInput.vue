<template>
  <div>
    <b-field grouped>
      <b-field
        :message="fields.previousDate.error"
        :type="fields.previousDate.type"
        label="Previous date"
      >
        <DateInput
          :value="input.previousDate"
          :disabled="disabled"
          @input="onPreviousDateChanged"
        />
      </b-field>
      <b-field
        :message="fields.previousTotals.error"
        :type="fields.previousTotals.type"
        label="Previous pending liability totals"
      >
        <FileUpload
          :disabled="disabled"
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
import { getExtension, loadFile } from '@/backend/file_utils';
import { csvOutputParser } from '@/backend/client_actions/pending_liabilities';
import { errorToString } from '@/backend/errors';
import moment from 'moment';

// FIXME: Validate on close
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
  data() {
    return {
      fields: {
        previousDate: {
          error: null,
          type: '',
        },
        previousTotals: {
          error: null,
          type: '',
        },
      },
    };
  },
  methods: {
    setFieldValidation(field, valid, error = null) {
      if (valid) {
        this.fields[field].error = null;
        this.fields[field].type = 'is-success';
      } else {
        this.fields[field].error = errorToString(error);
        this.fields[field].type = 'is-danger';
      }
    },
    async previousTotalsUploaded(file) {
      try {
        const fileExtension = getExtension(file.name);
        if (fileExtension !== 'csv') {
          throw new Error(`Pending liability totals file's extension must be '.csv' not '.${fileExtension}'.`);
        }
        const csvString = await loadFile(file);

        const pendingLiabilities = csvOutputParser(csvString);
        // FIXME: Validate pending liabilities
        this.input.previousPendingLiabilities = pendingLiabilities;

        this.setFieldValidation('previousTotals', true);
      } catch (error) {
        this.setFieldValidation('previousTotals', false, error);
      }
    },
    datesValid() {
      if (this.input.currentDate && this.input.previousDate) {
        const previousDate = moment(this.input.previousDate, 'DD/MM/YYYY');
        const currentDate = moment(this.input.currentDate, 'DD/MM/YYYY');
        return currentDate.diff(previousDate, 'days') > 0;
      }
      return false;
    },
    validateDate(type) {
      const propName = type === 'previous' ? 'previousDate' : 'currentDate';
      let error = null;
      if (!this.datesValid()) {
        if (type === 'previous') {
          error = 'Previous date must be before current date';
        } else {
          error = 'Current date must be after previous date';
        }
      }
      if (error !== null) {
        this.setFieldValidation(propName, false, error);
      } else {
        this.setFieldValidation(propName, true);
      }
    },
    validateDates() {
      this.validateDate('previous');
    },
    onPreviousDateChanged(value) {
      this.input.previousDate = value;
      this.validateDates();
    },
  },
};
</script>
