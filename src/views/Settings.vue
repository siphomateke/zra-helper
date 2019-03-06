<template>
  <div id="settings">
    <!-- eslint-disable max-len -->
    <form @submit.prevent="save">
      <div class="columns">
        <!-- Debug -->
        <div class="field column">
          <label class="label">Debug options</label>
          <div class="control">
            <b-checkbox
              v-model="config.debug.devtools"
              title="Whether the app should communicate with devtools. Extension must be reloaded for this to take effect."
            >Devtools</b-checkbox>
          </div>
          <div class="control">
            <b-checkbox
              v-model="config.debug.logToConsole"
              title="Show all user-side logs in the console."
            >Mirror log to developer console</b-checkbox>
          </div>
          <div class="control">
            <b-checkbox
              v-model="config.debug.errors"
              title="Show detailed information about errors if available."
            >Detailed error information</b-checkbox>
          </div>
          <div class="control">
            <b-checkbox
              v-model="config.debug.progressBars"
              :title="`Show raw progress bar values such as current value and max value.\nAdditionally keeps progress bars visible even after they are complete.`"
            >Progress bars</b-checkbox>
          </div>
          <div class="control">
            <b-checkbox
              v-model="config.debug.sendConfigToContentScripts"
              title="Whether these settings should be sent to content scripts. This will be removed if we ever need the settings in the content scripts for more than debugging."
            >Send settings to content scripts</b-checkbox>
          </div>
          <div class="control">
            <b-checkbox
              v-model="config.debug.missingElementInfo"
              :title="`Enable this to help debug errors like 'logout button not found' error.\n\n'Send settings to content scripts' must be enabled to use this`"
            >Collect extra information about missing element errors</b-checkbox>
          </div>
        </div>

        <!-- Log -->
        <div class="field column">
          <label class="label">Log</label>
          <div class="control">
            <b-checkbox v-model="config.log.showDateInTimestamp">Show date in timestamp</b-checkbox>
          </div>
        </div>

        <!-- Export -->
        <div class="field column">
          <label class="label">Export</label>
          <div class="control">
            <b-checkbox v-model="config.export.showSaveAsDialog">Show 'save as' dialogs</b-checkbox>
          </div>
          <div class="control">
            <b-checkbox
              v-model="config.export.removeMhtmlExtension"
              title="Removes the .mhtml file extension from all downloaded receipts. Enable this to stop Chrome on Windows from warning that every downloaded receipt is dangerous."
            >Remove '.mhtml' extension from downloaded receipts</b-checkbox>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="columns">
        <b-field
          label="Tab load timeout"
          title="The amount of time to wait for a tab to load (in milliseconds)."
          class="column"
        >
          <b-input
            v-model="config.tabLoadTimeout"
            type="number"
          />
        </b-field>
        <b-field
          label="Maximum open tabs"
          title="The maximum number of tabs that can be opened. Set to 0 to disable."
          class="column"
        >
          <b-input
            v-model="config.maxOpenTabs"
            type="number"
          />
        </b-field>
        <b-field
          label="Tab open delay"
          title="The time to wait after creating a tab before creating another one (in milliseconds)."
          class="column"
        >
          <b-input
            v-model="config.tabOpenDelay"
            type="number"
          />
        </b-field>
      </div>

      <b-field
        label="Max login attempts"
        title="The maximum number of times an attempt should be made to login to a client."
      >
        <b-input
          v-model="config.maxLoginAttempts"
          type="number"
        />
      </b-field>

      <b-field title="Whether to send a notification when all running tasks have completed.">
        <b-checkbox v-model="config.sendNotifications">Send notification when done</b-checkbox>
      </b-field>

      <div class="field is-grouped">
        <span class="control">
          <button
            class="button is-primary"
            type="submit"
          >Save changes</button>
        </span>
        <span class="control">
          <button
            class="button"
            type="button"
            @click="clearChanges"
          >Cancel</button>
        </span>
        <span class="control">
          <button
            class="button"
            type="button"
            @click="resetToDefaults"
          >Reset to defaults</button>
        </span>
      </div>
    </form>
    <!-- eslint-enable max-len -->
    <b-loading
      :active="isLoading"
      :is-full-page="false"
    />
  </div>
</template>

<script>
import { deepReactiveClone } from '@/utils';
import configMixin from '@/mixins/config';

export default {
  name: 'Settings',
  mixins: [configMixin],
  data() {
    return {
      config: {},
      isLoading: false,
    };
  },
  watch: {
    'config.debug.missingElementInfo': function missingElementInfo(value) {
      if (value && !this.config.debug.sendConfigToContentScripts) {
        this.config.debug.sendConfigToContentScripts = true;
      }
    },
    'config.debug.sendConfigToContentScripts': function sendConfigToContentScripts(value) {
      if (!value && this.config.debug.missingElementInfo) {
        this.config.debug.missingElementInfo = false;
      }
    },
  },
  created() {
    this.pullConfigFromStore();
    this.load();
  },
  methods: {
    async load() {
      await this.loadConfig();
      this.pullConfigFromStore();
    },
    pullConfigFromStore() {
      // deep clone so vuex doesn't complain
      deepReactiveClone(this.$store.state.config, this.config);
    },
    async save() {
      try {
        await this.$store.dispatch('config/set', this.config);
        await this.$store.dispatch('config/save');
        this.$toast.open({
          type: 'is-success',
          message: 'Successfully saved settings',
        });
      } catch (e) {
        this.$toast.open({
          type: 'is-danger',
          message: `Error saving settings: ${e}`,
        });
      }
    },
    async clearChanges() {
      this.pullConfigFromStore();
      this.$emit('cancel');
    },
    async resetToDefaults() {
      try {
        await this.$store.dispatch('config/resetToDefaults');
        this.pullConfigFromStore();
        this.$toast.open({
          type: 'is-success',
          message: 'Reset settings to their default values',
        });
      } catch (e) {
        this.$toast.open({
          type: 'is-danger',
          message: `Error loading default settings: ${e}`,
        });
      }
    },
  },
};
</script>

<style>
#settings {
  position: relative;
}
</style>
