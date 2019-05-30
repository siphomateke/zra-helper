<template>
  <form @submit.prevent="submit">
    <component
      :is="actionInputComponent"
      :disabled="disabled"
      :bus="bus"
      v-model="input"
    />
    <button
      v-show="false"
      type="submit"
    >Submit</button>
  </form>
</template>

<script>
import Vue from 'vue';
import { mapGetters } from 'vuex';
import PendingLiabilitiesInput from '@/components/ClientActionInputs/PendingLiabilitiesInput.vue';
import ReturnsInput from '@/components/ClientActionInputs/ReturnsInput.vue';
import AckReturnsInput from '@/components/ClientActionInputs/AckReturnsInput.vue';
import PaymentReceiptsInput from '@/components/ClientActionInputs/PaymentReceiptsInput.vue';
import TaxPayerLedgerInput from '@/components/ClientActionInputs/TaxPayerLedgerInput.vue';
import ClientActionPendingLiabilityChangeReasonsInput from '@/components/ClientActionInputs/PendingLiabilityChangeReasonsInput.vue';
import { generateValueSyncMixin } from '@/mixins/sync_prop';

export const actionInputComponents = {
  getAllPendingLiabilities: PendingLiabilitiesInput,
  getReturns: ReturnsInput,
  getAcknowledgementsOfReturns: AckReturnsInput,
  getPaymentReceipts: PaymentReceiptsInput,
  taxPayerLedger: TaxPayerLedgerInput,
  pendingLiabilityChangeReasons: ClientActionPendingLiabilityChangeReasonsInput,
};

export default {
  mixins: [
    generateValueSyncMixin('input'),
  ],
  props: {
    id: {
      type: String,
      required: true,
    },
    value: {
      type: Object,
      default: null,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    /** Event bus */
    bus: {
      type: Object,
      default: new Vue(),
    },
  },
  computed: {
    ...mapGetters('clientActions', [
      'getDefaultActionInput',
    ]),
    actionInputComponent() {
      return actionInputComponents[this.id];
    },
  },
  created() {
    if (this.input === null) {
      this.input = this.getDefaultActionInput(this.id);
    }
  },
  methods: {
    submit() {
      this.bus.$emit('submit');
    },
  },
};
</script>
