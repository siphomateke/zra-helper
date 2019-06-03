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

export default {
  name: 'ClientActionTaxPayerLedgerInput',
  components: {
    DateRangeInput,
    TaxTypeSelect,
  },
  mixins: [ClientActionInputMixin],
  props: {
    value: {
      type: Object,
      default: () => ({
        taxTypeIds: [],
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
