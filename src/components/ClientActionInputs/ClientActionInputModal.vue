<template>
  <div v-if="actionHasInput">
    <CardModal
      :active.sync="internalActive"
      :title="`${getActionById(actionId).name} input`"
      :scrollable="false"
    >
      <ClientActionInput
        slot="body"
        :id="actionId"
        :disabled="disabled"
        :bus="inputBus"
        v-model="input"
        @input="onInput"
      />
      <div slot="foot">
        <button
          :disabled="disabled"
          class="button is-primary"
          type="button"
          @click="submit"
        >Save</button>
        <button
          class="button"
          type="button"
          @click="internalActive = false"
        >Cancel</button>
      </div>
    </CardModal>
  </div>
</template>

<script>
import Vue from 'vue';
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
      inputBus: new Vue(),
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
  methods: {
    submit() {
      this.inputBus.$emit('submit');
    },
    onInput() {
      // As soon as new valid input has been received, close the modal.
      this.internalActive = false;
    },
  },
};
</script>
