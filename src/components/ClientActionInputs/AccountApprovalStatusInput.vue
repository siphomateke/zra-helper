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
    <b-checkbox v-model="input.getAckReceipts">
      Check if returns are provisional
    </b-checkbox>
    <!-- eslint-disable max-len -->
    <b-notification
      :active="showAckReceiptWarning && !ackReceiptWarningDismissed"
      type="is-warning"
      closable
      @update:active="dismissAckReceiptWarning"
    >
      Checking if returns are provisional requires checking acknowledgement of returns receipts which will make this action take significantly longer.
    </b-notification>
    <!-- eslint-enable max-len -->
  </div>
</template>

<script>
import AbstractReturnsInput from './AbstractReturnsInput.vue';
import CheckAccountApprovalStatusClientAction from '@/backend/client_actions/return_history/account_approval_status';
import ClientActionInputsMixin from './mixin';

// FIXME: Don't duplicate AbstractReturnsInput's template
export default {
  name: 'ClientActionAccountApprovalStatusInput',
  extends: AbstractReturnsInput,
  mixins: [ClientActionInputsMixin(CheckAccountApprovalStatusClientAction)],
  data() {
    return {
      showAckReceiptWarning: false,
    };
  },
  computed: {
    ackReceiptWarningDismissed() {
      const { config } = this.$store.state;
      return config.dismissed.checkApprovalStatusAction.ackReceiptsPerformanceWarning;
    },
  },
  watch: {
    'input.getAckReceipts': function inputGetAckReceipts(value) {
      if (value === true) {
        this.showAckReceiptWarning = true;
      } else {
        this.showAckReceiptWarning = false;
      }
    },
  },
  methods: {
    dismissAckReceiptWarning() {
      this.$store.dispatch('config/set', {
        dismissed: {
          checkApprovalStatusAction: {
            ackReceiptsPerformanceWarning: true,
          },
        },
      });
      this.$store.dispatch('config/save');
    },
  },
};
</script>
