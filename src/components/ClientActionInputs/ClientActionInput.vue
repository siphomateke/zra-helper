<template>
  <component
    :is="actionInputComponent"
    :value="value"
    @input="value => $emit('input', value)"
  />
</template>

<script>
import PendingLiabilitiesInput from '@/components/ClientActionInputs/PendingLiabilitiesInput.vue';
import ReturnsInput from '@/components/ClientActionInputs/ReturnsInput.vue';
import AckReturnsInput from '@/components/ClientActionInputs/AckReturnsInput.vue';
import PaymentReceiptsInput from '@/components/ClientActionInputs/PaymentReceiptsInput.vue';

export const actionInputComponents = {
  getAllPendingLiabilities: PendingLiabilitiesInput,
  getReturns: ReturnsInput,
  getAcknowledgementsOfReturns: AckReturnsInput,
  getPaymentReceipts: PaymentReceiptsInput,
};

export default {
  props: {
    id: {
      type: String,
      required: true,
    },
    value: {
      type: Object,
      default: () => ({}),
    },
  },
  computed: {
    actionInputComponent() {
      return actionInputComponents[this.id];
    },
  },
};
</script>
