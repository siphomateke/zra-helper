<template>
  <b-field grouped>
    <b-field
      :type="$bFieldType('from_date')"
      :message="$bFieldValidationError('from_date')"
      label="From date"
    >
      <DateInput
        v-model="fromDate"
        v-validate="fromDateValidation"
        :disabled="disabled"
        name="from_date"
      />
    </b-field>
    <b-field
      :type="$bFieldType('to_date')"
      :message="$bFieldValidationError('to_date')"
      label="To date"
    >
      <DateInput
        v-model="toDate"
        v-validate="toDateValidation"
        :disabled="disabled"
        name="to_date"
      />
    </b-field>
  </b-field>
</template>

<script>
import DateInput from '@/components/fields/DateInput.vue';

export default {
  name: 'DateRangeInput',
  components: {
    DateInput,
  },
  inject: ['$validator'],
  props: {
    value: {
      type: Array,
      default: () => ([]),
      validator(value) {
        if (value.length > 0 && value.length !== 2) {
          return false;
        }
        return true;
      },
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      fromDate: '',
      toDate: '',
    };
  },
  computed: {
    internalValue() {
      return {
        fromDate: this.fromDate,
        toDate: this.toDate,
      };
    },
    fromDateValidation() {
      return {
        required: true,
        date_format: 'dd/MM/yyyy',
        before: [
          this.toDate,
          true, // include current date
        ],
      };
    },
    toDateValidation() {
      return {
        required: true,
        date_format: 'dd/MM/yyyy',
        after: [
          this.fromDate,
          true, // include current date
        ],
      };
    },
  },
  watch: {
    value: {
      handler([fromDate, toDate]) {
        this.fromDate = fromDate;
        this.toDate = toDate;
      },
      immediate: true,
    },
    fromDate() {
      this.onInput();
    },
    toDate() {
      this.onInput();
    },
  },
  methods: {
    onInput() {
      this.$emit('input', this.internalValue);
    },
  },
};
</script>
