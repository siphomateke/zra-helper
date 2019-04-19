<template>
  <div v-if="actionHasInput">
    <CardModal
      :active.sync="internalActive"
      :title="`${getActionById(actionId).name} input`"
    >
      <ClientActionInput
        slot="body"
        :id="actionId"
        :disabled="disabled"
        v-model="input"
      />
    </CardModal>
  </div>
</template>

<script>
import { mapGetters } from 'vuex';
import CardModal from '@/components/CardModal.vue';
import ClientActionInput, { actionInputComponents } from '@/components/ClientActionInputs/ClientActionInput.vue';
import { generateValueSyncMixin, generatePropSyncMixin } from '@/mixins/sync_prop';

export default {
  name: 'ClientActionInputModal',
  components: {
    CardModal,
    ClientActionInput,
  },
  mixins: [
    generateValueSyncMixin('input'),
    generatePropSyncMixin('internalActive', 'active'),
  ],
  props: {
    actionId: {
      type: String,
      default: null,
    },
    active: {
      type: Boolean,
      default: false,
    },
    value: {
      type: Object,
      default: null,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      actionInputComponents,
    };
  },
  computed: {
    ...mapGetters('clientActions', [
      'getActionById',
    ]),
    actionHasInput() {
      return this.actionId in actionInputComponents;
    },
  },
};
</script>
