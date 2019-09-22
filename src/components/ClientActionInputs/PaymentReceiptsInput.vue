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
import GetPaymentReceiptsClientAction from '@/backend/client_actions/payment_history';

// FIXME: Add `receipts` and `receiptDataPages` inputs.
export default {
  name: 'ClientActionAckReturnsInput',
  components: {
    DateRangeInput,
  },
  mixins: [ClientActionInputMixin(GetPaymentReceiptsClientAction)],
  methods: {
    dateRangeInput(value) {
      this.$set(this.input, 'fromDate', value.fromDate);
      this.$set(this.input, 'toDate', value.toDate);
    },
  },
};
</script>
