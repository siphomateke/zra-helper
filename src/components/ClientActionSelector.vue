<template>
  <div class="field client-action-selector">
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
      >
        {{ action.name }}
      </b-checkbox>
    </div>
  </div>
</template>

<script>
import { mapGetters, mapState } from 'vuex';
import { BrowserName } from '@/backend/constants';
import { joinSpecialLast } from '@/utils';
import { generateValueSyncMixin } from '@/mixins/sync_prop';

export default {
  name: 'ClientActionSelector',
  mixins: [generateValueSyncMixin('selectedActionIds')],
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
  computed: {
    ...mapState({
      clientActionsObject: state => state.clientActions.actions,
    }),
    ...mapGetters('clientActions', [
      'actionSupportsCurrentBrowser',
      'getBrowsersActionSupports',
    ]),
    actions() {
      return Object.values(this.clientActionsObject);
    },
  },
  methods: {
    actionIsDisabled(actionId) {
      return !this.actionSupportsCurrentBrowser(actionId) || this.disabled;
    },
    getNamesOfBrowsersActionSupports(actionId) {
      return this.getBrowsersActionSupports(actionId).map(browserCode => BrowserName[browserCode]);
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
  },
};
</script>
