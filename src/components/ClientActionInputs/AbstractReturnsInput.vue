<template>
  <div>
    <DateRangeInput
      :value="[input.fromDate, input.toDate]"
      @input="dateRangeInput"
    />
    <TaxTypeSelect
      v-model="input.taxTypeIds"
      :multiple="true"
    />
  </div>
</template>

<script>
import DateRangeInput from '@/components/fields/DateRangeInput.vue';
import TaxTypeSelect from '@/components/fields/TaxTypeSelect.vue';
import ClientActionInputMixin from './mixin';

// FIXME: Add `returns` and `returnHistoryPages` inputs.
export default {
  components: {
    DateRangeInput,
    TaxTypeSelect,
  },
  mixins: [ClientActionInputMixin],
  props: {
    value: {
      type: Object,
      default: () => ({
        fromDate: null,
        toDate: null,
        taxTypeIds: null,
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
