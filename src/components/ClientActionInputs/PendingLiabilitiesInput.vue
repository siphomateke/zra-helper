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
import GetAllPendingLiabilitiesClientAction from '@/backend/client_actions/pending_liabilities';

export default {
  name: 'ClientActionsPendingLabilitiesInput',
  components: {
    TaxTypeSelect,
  },
  mixins: [ClientActionInputMixin(GetAllPendingLiabilitiesClientAction)],
};
</script>
