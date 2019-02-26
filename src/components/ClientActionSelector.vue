<template>
  <div>
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
</template>

<script>
import { mapGetters, mapState } from 'vuex';
import { browserNames } from '@/backend/constants';
import { joinSpecialLast } from '@/utils';

export default {
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
  },
  watch: {
    selected(value) {
      this.$emit('input', value);
    },
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
  },
};
</script>
