<template>
  <div>
    <DateRangeInput
      :value="[input.fromDate, input.toDate]"
      :disabled="disabled"
      @input="dateRangeInput"
    />
  </div>
</template>

<script>
import DateRangeInput from '@/components/fields/DateRangeInput.vue';
import ClientActionInputMixin from './mixin';

export default {
  name: 'ClientActionTaxPayerLedgerInput',
  components: {
    DateRangeInput,
  },
  mixins: [ClientActionInputMixin],
  props: {
    value: {
      type: Object,
      default: () => ({
        fromDate: null,
        toDate: null,
      }),
    },
  },
  methods: {
    dateRangeInput(value) {
      this.$set(this.input, 'fromDate', value.fromDate);
      this.$set(this.input, 'toDate', value.toDate);
    },
  },
};
</script>
