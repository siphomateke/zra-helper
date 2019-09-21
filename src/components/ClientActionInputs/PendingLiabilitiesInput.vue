<template>
  <div>
    <TaxTypeSelect
      v-model="input.taxTypeIds"
      :disabled="disabled"
      :multiple="true"
    />
    <!-- eslint-disable max-len -->
    <b-checkbox
      v-model="input.downloadPages"
      title="Whether the pending liability pages should be downloaded as proof that the collected pending liability amounts are accurate."
      :disabled="disabled"
    >
      Download pages
    </b-checkbox>
    <!-- eslint-enable max-len -->
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
