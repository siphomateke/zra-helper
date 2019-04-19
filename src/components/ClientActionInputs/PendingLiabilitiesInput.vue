<template>
  <div>
    <TaxTypeSelect
      v-model="input.taxTypeIds"
      :disabled="disabled"
      :multiple="true"
    />
  </div>
</template>

<script>
import TaxTypeSelect from '@/components/fields/TaxTypeSelect.vue';
import ClientActionInputMixin from './mixin';

export default {
  name: 'ClientActionsPendingLabilitiesInput',
  components: {
    TaxTypeSelect,
  },
  mixins: [ClientActionInputMixin],
  props: {
    value: {
      type: Object,
      default: () => ({
        taxTypeIds: [],
      }),
    },
  },
};
</script>
