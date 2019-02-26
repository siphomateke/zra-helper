<template>
  <div class="field client-action-selector">
    <div class="field">
      <label class="label">Select actions</label>
      <div
        v-for="action in actions"
        :key="action.id"
        class="control">
        <b-checkbox
          v-model="selected"
          :native-value="action.id"
          :disabled="actionIsDisabled(action.id)"
          :title="actionIsDisabled(action.id) ? actionDisabledReason(action.id) : ''"
          name="actions">
          {{ action.name }}
        </b-checkbox>
      </div>
    </div>

    <div class="field">
      <b-checkbox v-model="customOrder">Use custom execution order</b-checkbox>
      <DraggableList
        v-if="customOrder"
        v-model="orderedSelectedActions"
        :drag-anywhere="true">
        <span slot-scope="{item}">{{ item.name }}</span>
      </DraggableList>
    </div>
  </div>
</template>

<script>
import { mapGetters, mapState } from 'vuex';
import { browserNames } from '@/backend/constants';
import { joinSpecialLast } from '@/utils';
import DraggableList from '@/components/DraggableList.vue';

export default {
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
      selected: this.value,
      customOrder: false,
      orderedSelectedActions: [],
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
    selectedActions() {
      return this.selected.map(id => this.clientActionsObject[id]);
    },
    orderedSelectedIds() {
      return this.orderedSelectedActions.map(action => action.id);
    },
    orderedTest() {
      return this.actions.map(action => ({
        id: action.id,
        name: action.name,
        disabled: this.actionIsDisabled(action.id),
      }));
    },
  },
  watch: {
    value(value) {
      this.selected = value;
    },
    selectedActions() {
      this.updatedOrderedSelectedActions();
    },
    orderedSelectedIds(value) {
      this.$emit('input', value);
    },
  },
  created() {
    this.updatedOrderedSelectedActions();
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
    updatedOrderedSelectedActions() {
      this.orderedSelectedActions = this.selectedActions;
    },
  },
};
</script>
