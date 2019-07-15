<template>
  <component
    v-if="customOutputComponentExists"
    :is="customOutputComponent"
    :clients="clients"
    :outputs="outputs"
  />
</template>


<script>
import PendingLiabilityChangeReasonsOutput from './custom_outputs/PendingLiabilityChangeReasonsOutput/PendingLiabilityChangeReasonsOutput.vue';
import { validateClients } from '@/validation/props/client';

const customOutputComponents = {
  pendingLiabilityChangeReasons: PendingLiabilityChangeReasonsOutput,
};

/**
 * Wrapper component for custom action output components.
 */
export default {
  name: 'ClientActionOutputComponent',
  // TODO: Validate props
  props: {
    clients: {
      type: Array,
      required: true,
      validator: validateClients,
    },
    actionId: {
      type: String,
      required: true,
    },
    /** Action's outputs by client ID */
    outputs: {
      type: Object,
      required: true,
    },
  },
  computed: {
    customOutputComponentExists() {
      return this.actionId in customOutputComponents;
    },
    customOutputComponent() {
      return customOutputComponents[this.actionId];
    },
  },
};
</script>
