<template>
  <div class="field">
    <DraggableList
      :disabled="disabled || actions.length < 2"
      :value="actions"
      :drag-anywhere="true"
      @input="changedOrder"
    >
      <template slot-scope="{item}">
        <span>{{ item.name }}</span>
        <OpenModalButton
          v-if="item.id in actionInputComponents"
          label="Edit input"
          class="is-small"
          style="margin-left: auto;"
          @click="editInput(item.id)"
        />
        <ClientActionInputModal
          :action-id="item.id"
          :active.sync="inputModalsVisible[item.id]"
          :disabled="disabled"
          v-model="actionInputs[item.id]"
        />
      </template>
    </DraggableList>
  </div>
</template>

<script>
import { mapGetters } from 'vuex';
import { generateValueSyncMixin } from '@/mixins/sync_prop';
import DraggableList from '@/components/DraggableList.vue';
import OpenModalButton from '@/components/OpenModalButton.vue';
import { actionInputComponents } from '@/components/ClientActionInputs/ClientActionInput.vue';
import ClientActionInputModal from '@/components/ClientActionInputs/ClientActionInputModal.vue';
import generateObjectKeysSync from '@/mixins/object_keys_sync';
import { deepAssign } from '@/utils';

/**
 * Allows the order of the selected client actions to be modified as well as modifying action
 * inputs.
 */
export default {
  name: 'ClientActionList',
  components: {
    DraggableList,
    OpenModalButton,
    ClientActionInputModal,
  },
  mixins: [
    generateValueSyncMixin('selectedActionIds'),
    generateObjectKeysSync('actionIds', 'inputModalsVisible', false),
  ],
  props: {
    value: {
      type: Array,
      default: () => [],
    },
    actionIds: {
      type: Array,
      default: () => [],
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    inputs: {
      type: Object,
      default: () => ({}),
    },
  },
  data() {
    return {
      actionInputs: {},
      inputModalsVisible: {},
      actionInputComponents,
    };
  },
  computed: {
    ...mapGetters('clientActions', [
      'getActionById',
      'getDefaultActionInput',
    ]),
    actions() {
      return this.actionIds.map(id => this.getActionById(id));
    },
    /**
     * Default inputs of clients that take inputs and have been selected.
     */
    defaultInputs() {
      const actionsWithInputsIds = Object.keys(actionInputComponents);
      const actionIds = actionsWithInputsIds.filter(id => this.actionIds.includes(id));
      const defaultInputs = {};
      for (const actionId of actionIds) {
        const defaultInput = this.getDefaultActionInput(actionId);
        defaultInputs[actionId] = defaultInput;
      }
      return defaultInputs;
    },
  },
  watch: {
    actionInputs: {
      immediate: true,
      deep: true,
      handler(value) {
        this.$emit('update:inputs', value);
      },
    },
    inputs: {
      immediate: true,
      deep: true,
      handler() {
        this.updateInputs();
      },
    },
    actionIds() {
      this.updateInputs();
    },
  },
  methods: {
    changedOrder(actions) {
      this.selectedActionIds = actions.map(action => action.id);
    },
    editInput(actionId) {
      this.$set(this.inputModalsVisible, actionId, true);
    },
    updateInputs() {
      for (const actionId of Object.keys(this.actionInputs)) {
        if (!this.actionIds.includes(actionId)) {
          this.$delete(this.actionInputs, actionId);
        }
      }
      for (const actionId of Object.keys(this.defaultInputs)) {
        const defaultInput = this.defaultInputs[actionId];
        const input = this.inputs[actionId];
        this.$set(this.actionInputs, actionId, deepAssign(defaultInput, input));
      }
    },
  },
};
</script>
