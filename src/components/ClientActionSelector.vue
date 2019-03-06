<template>
  <div class="field client-action-selector">
    <div class="field">
      <label class="label">Select actions</label>
      <div
        v-for="action in actions"
        :key="action.id"
        class="control"
      >
        <b-checkbox
          v-model="selectedActionIds"
          :native-value="action.id"
          :disabled="actionIsDisabled(action.id)"
          :title="actionIsDisabled(action.id) ? actionDisabledReason(action.id) : ''"
          name="actions"
        >{{ action.name }}</b-checkbox>
      </div>
    </div>

    <template v-if="multipleActionsSelected">
      <b-collapse :open.sync="showOrderChooser">
        <div
          slot="trigger"
          slot-scope="props"
        >
          <button
            class="button is-small"
            type="button"
          >
            <b-icon
              :icon="props.open ? 'caret-down' : 'caret-right'"
              size="is-small"
            />
            <span>{{ `${props.open ? 'Hide' : 'Show'} execution order` }}</span>
          </button>
        </div>
        <DraggableList
          :disabled="disabled"
          :value="selectedActions"
          :drag-anywhere="true"
          @input="changedOrder"
        >
          <span slot-scope="{item}">{{ item.name }}</span>
        </DraggableList>
      </b-collapse>
    </template>
  </div>
</template>

<script>
import { mapGetters, mapState } from 'vuex';
import { browserNames } from '@/backend/constants';
import { joinSpecialLast } from '@/utils';
import DraggableList from '@/components/DraggableList.vue';

export default {
  name: 'ClientActionSelector',
  components: {
    DraggableList,
  },
  props: {
    value: {
      type: Array,
      default: () => [],
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      selectedActionIds: this.value,
      selectedActions: [],
      showOrderChooser: false,
    };
  },
  computed: {
    ...mapState({
      clientActionsObject: state => state.clientActions.all,
    }),
    ...mapGetters('clientActions', [
      'actionSupportsCurrentBrowser',
      'getBrowsersActionSupports',
    ]),
    actions() {
      return Object.values(this.clientActionsObject);
    },
    multipleActionsSelected() {
      return this.selectedActionIds.length > 1;
    },
  },
  watch: {
    value(value) {
      this.selectedActionIds = value;
    },
    selectedActionIds(ids) {
      this.updateSelectedActions();
      this.$emit('input', ids);
    },
  },
  created() {
    this.updateSelectedActions();
  },
  methods: {
    actionIsDisabled(actionId) {
      return !this.actionSupportsCurrentBrowser(actionId) || this.disabled;
    },
    getNamesOfBrowsersActionSupports(actionId) {
      return this.getBrowsersActionSupports(actionId).map(browserCode => browserNames[browserCode]);
    },
    getUnsupportedBrowserMessage(actionId) {
      const browsers = this.getNamesOfBrowsersActionSupports(actionId);
      return `This action can only be run in ${joinSpecialLast(browsers, ', ', ' or ')}`;
    },
    actionDisabledReason(actionId) {
      if (!this.actionSupportsCurrentBrowser(actionId)) {
        return this.getUnsupportedBrowserMessage(actionId);
      }
      return '';
    },
    changedOrder(reorderedActions) {
      this.selectedActionIds = reorderedActions.map(action => action.id);
    },
    updateSelectedActions() {
      this.selectedActions = this.selectedActionIds.map(id => this.clientActionsObject[id]);
    },
  },
};
</script>
