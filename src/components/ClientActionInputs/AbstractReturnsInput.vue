<template>
  <div>
    <DateRangeInput
      :value="[input.fromDate, input.toDate]"
      :disabled="disabled"
      @input="dateRangeInput"
    />
    <TaxTypeSelect
      v-model="input.taxTypeIds"
      :disabled="disabled"
      :multiple="true"
    />
  </div>
</template>

<script>
import DateRangeInput from '@/components/fields/DateRangeInput.vue';
import TaxTypeSelect from '@/components/fields/TaxTypeSelect.vue';
import ClientActionInputMixin from './mixin';
import { GetReturnHistoryClientActionOptions } from '@/backend/client_actions/return_history/base';

// FIXME: Add `returns` and `returnHistoryPages` inputs.
export default {
  components: {
    DateRangeInput,
    TaxTypeSelect,
  },
  mixins: [ClientActionInputMixin(GetReturnHistoryClientActionOptions)],
  methods: {
    dateRangeInput(value) {
      this.$set(this.input, 'fromDate', value.fromDate);
      this.$set(this.input, 'toDate', value.toDate);
    },
  },
};
</script>
