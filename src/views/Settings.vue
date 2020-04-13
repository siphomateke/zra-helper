<template>
  <div id="settings">
    <!-- eslint-disable max-len -->
    <form @submit.prevent="save">
      <div class="columns">
        <!-- Debug -->
        <div class="column">
          <BaseCard title="Debug options">
            <div class="field">
              <div class="control">
                <b-checkbox
                  v-model="config.debug.devtools"
                  title="Whether the app should communicate with devtools. Extension must be reloaded for this to take effect."
                >
                  Devtools
                </b-checkbox>
              </div>
              <div class="control">
                <b-checkbox
                  v-model="config.debug.logToConsole"
                  title="Show all user-side logs in the console."
                >
                  Mirror log to developer console
                </b-checkbox>
              </div>
              <div class="control">
                <b-checkbox
                  v-model="config.debug.showTaskErrorsInConsole"
                  title="Logs full details of all task errors to the console."
                >
                  Show task errors in console
                </b-checkbox>
              </div>
              <div class="control">
                <b-checkbox
                  v-model="config.debug.errors"
                  title="Show detailed information about errors if available."
                >
                  Detailed error information
                </b-checkbox>
              </div>
              <div class="control">
                <b-checkbox
                  v-model="config.debug.progressBars"
                  :title="`Show raw progress bar values such as current value and max value.\nAdditionally keeps progress bars visible even after they are complete.`"
                >
                  Progress bars
                </b-checkbox>
              </div>
              <div class="control">
                <b-checkbox
                  v-model="config.debug.sendConfigToContentScripts"
                  title="Whether these settings should be sent to content scripts. This will be removed if we ever need the settings in the content scripts for more than debugging."
                >
                  Send settings to content scripts
                </b-checkbox>
              </div>
              <div class="control">
                <b-checkbox
                  v-model="config.debug.missingElementInfo"
                  :title="`Enable this to help debug errors like 'logout button not found' error.\n\n'Send settings to content scripts' must be enabled to use this`"
                >
                  Collect extra information about missing element errors
                </b-checkbox>
              </div>
              <div class="control">
                <b-checkbox
                  v-model="config.debug.anonymizeClientsInExports"
                  title="Enable this to remove sensitive client information such as names, usernames and passwords from exports."
                >
                  Anonymize clients in exports
                </b-checkbox>
              </div>
              <div class="control">
                <b-checkbox
                  v-model="config.debug.calculateTaskDuration"
                  title="Tracks how long tasks take and displays the information in their titles. Must be enabled before running the tasks."
                >
                  Measure task duration
                </b-checkbox>
              </div>
              <div class="control">
                <b-checkbox
                  v-model="config.debug.captchaSolving"
                  title="Logs captcha solving steps and recognition probabilities."
                >
                  Captcha solving
                </b-checkbox>
              </div>
            </div>
          </BaseCard>
        </div>

        <!-- Export -->
        <div class="column">
          <BaseCard title="Export">
            <div class="field">
              <div class="control">
                <b-checkbox v-model="config.export.showSaveAsDialog">
                  Show 'save as' dialogs
                </b-checkbox>
              </div>
            </div>
            <div class="field">
              <div class="control">
                <b-checkbox
                  v-model="config.export.taskDuration"
                  title="Whether to include how long tasks took to run in the task export. 'Measure task duration' must have been enabled before the tasks were run for this to work."
                  @input="enabled => {if (enabled) config.debug.calculateTaskDuration = true}"
                >
                  Include task duration in exports
                </b-checkbox>
              </div>
            </div>
            <b-field
              v-if="pageDownloadTypes.length > 1"
              label="Save pages as"
              title="File type to use when downloading pages such as receipts."
            >
              <b-select v-model="config.export.pageDownloadFileType">
                <option
                  v-for="option in pageDownloadTypes"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </b-select>
            </b-field>
            <b-field v-if="config.export.pageDownloadFileType === 'mhtml'">
              <b-checkbox
                v-model="config.export.removeMhtmlExtension"
                title="Removes the .mhtml file extension from all downloaded receipts. Enable this to stop Chrome on Windows from warning that every downloaded receipt is dangerous."
              >
                Remove '.mhtml' extension from downloaded receipts
              </b-checkbox>
            </b-field>
            <b-field v-if="config.export.pageDownloadFileType === 'html'">
              <b-checkbox
                v-model="config.export.useFilenameAsHtmlPageTitle"
                title="Makes the page title of downloaded HTML files the same as their filenames. This is useful when re-saving HTML files as PDFs in Chrome since it uses page titles as filenames."
              >
                Use HTML filename as title
              </b-checkbox>
            </b-field>
            <b-field label="End of line character">
              <b-select v-model="config.export.eol">
                <option
                  title="Automatically detect end of line character based on operating system."
                  value="auto"
                >
                  Auto
                </option>
                <option
                  title="\n"
                  value="LF"
                >
                  LF
                </option>
                <option
                  title="\r\n"
                  value="CRLF"
                >
                  CRLF
                </option>
              </b-select>
            </b-field>
          </BaseCard>
        </div>

        <!-- Log -->
        <div class="column">
          <BaseCard title="Log">
            <div class="field">
              <div class="control">
                <b-checkbox v-model="config.log.showDateInTimestamp">
                  Show date in timestamp
                </b-checkbox>
              </div>
            </div>
          </BaseCard>
        </div>
      </div>

      <!-- Performance -->
      <div class="columns">
        <div class="column">
          <BaseCard title="Performance">
            <b-field title="If enabled, when running actions, the ZRA website will be stripped down to the bare minimum to increase performance. This means that while the extension is running, the ZRA website may not be usable.">
              <b-checkbox v-model="config.zraLiteMode">
                Use basic HTML version of ZRA when running
              </b-checkbox>
            </b-field>
            <b-field
              label="HTTP request timeout"
              title="The amount of time to wait for HTTP requests to complete (in milliseconds). Set to 0 to disable."
              horizontal
            >
              <b-field>
                <b-input
                  v-model="config.requestTimeout"
                  type="number"
                />
                <p class="control">
                  <span class="button is-static">ms</span>
                </p>
              </b-field>
            </b-field>
            <b-field
              label="Max parallel HTTP requests"
              title="The maximum number of HTTP requests that can be running at once. Set to 0 to disable."
              horizontal
            >
              <b-input
                v-model="config.maxConcurrentRequests"
                type="number"
              />
            </b-field>
            <b-field
              label="Tab load timeout"
              title="The amount of time to wait for a tab to load (in milliseconds)."
              horizontal
            >
              <b-field>
                <b-input
                  v-model="config.tabLoadTimeout"
                  type="number"
                />
                <p class="control">
                  <span class="button is-static">ms</span>
                </p>
              </b-field>
            </b-field>
            <b-field
              label="Maximum open tabs"
              title="The maximum number of tabs that can be opened. Set to 0 to disable."
              horizontal
            >
              <b-input
                v-model="config.maxOpenTabs"
                type="number"
              />
            </b-field>
            <b-field
              label="Max open tabs when downloading"
              title="The maximum number of tabs that can be opened when downloading receipts. Set to 0 to disable."
              horizontal
            >
              <b-input
                v-model="config.maxOpenTabsWhenDownloading"
                type="number"
              />
            </b-field>
            <b-field
              label="Max parallel loading tabs"
              title="The maximum number of tabs that can be loading at once. Set to 0 to disable."
              horizontal
            >
              <b-input
                v-model="config.maxLoadingTabs"
                type="number"
              />
            </b-field>
            <b-field
              label="Tab open delay"
              title="The time to wait after creating a tab before creating another one (in milliseconds)."
              horizontal
            >
              <b-field>
                <b-input
                  v-model="config.tabOpenDelay"
                  type="number"
                />
                <p class="control">
                  <span class="button is-static">ms</span>
                </p>
              </b-field>
            </b-field>
            <b-field
              label="Max parallel downloads"
              title="The maximum number of downloads that can be downloading at the same time. Set to 0 to disable."
              horizontal
            >
              <b-input
                v-model="config.maxConcurrentDownloads"
                type="number"
              />
            </b-field>
            <b-field
              label="Download delay"
              title="Time time to wait after starting a download before starting another (in milliseconds)."
              horizontal
            >
              <b-field>
                <b-input
                  v-model="config.downloadDelay"
                  type="number"
                />
                <p class="control">
                  <span class="button is-static">ms</span>
                </p>
              </b-field>
            </b-field>
          </BaseCard>
        </div>
        <div class="column">
          <BaseCard title="Misc">
            <b-field title="Whether to send a notification when all running tasks have completed.">
              <b-checkbox v-model="config.sendNotifications">
                Send notification when done
              </b-checkbox>
            </b-field>

            <b-field title="Whether to show a prompt to retry actions that encountered errors when all running tasks have completed.">
              <b-checkbox v-model="config.promptRetryActions">
                Prompt to retry actions that fail
              </b-checkbox>
            </b-field>

            <b-field
              label="Max login attempts"
              title="The maximum number of times an attempt should be made to login to a client."
              horizontal
            >
              <b-input
                v-model="config.maxLoginAttempts"
                type="number"
              />
            </b-field>
            <b-field
              label="Captcha Solver URL"
              title="IP address and port of the TensorFlow model server used to solve ZRA's captchas."
              horizontal
            >
              <b-input
                v-model="config.tensorflowCaptchaServerUrl"
                placeholder="http://localhost:8501"
                type="text"
              />
            </b-field>
          </BaseCard>
        </div>
      </div>
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
      :active="configIsLoading"
      :is-full-page="false"
    />
  </div>
</template>

<script>
import { deepReactiveClone, getCurrentBrowser } from '@/utils';
import configMixin from '@/mixins/config';
import BaseCard from '@/components/BaseCard.vue';
import { BrowserFeature, featuresSupportedByBrowsers } from '@/backend/constants';

const currentBrowser = getCurrentBrowser();

export default {
  name: 'SettingsView',
  components: {
    BaseCard,
  },
  mixins: [configMixin],
  data() {
    return {
      config: {},
    };
  },
  computed: {
    mhtmlSupported() {
      const featuresSupportedByCurrentBrowser = featuresSupportedByBrowsers[currentBrowser];
      return featuresSupportedByCurrentBrowser.includes(BrowserFeature.MHTML);
    },
    pageDownloadTypes() {
      const options = [
        { value: 'html', label: 'Plain HTML' },
      ];
      if (this.mhtmlSupported) {
        options.push({ value: 'mhtml', label: 'MHTML' });
      }
      return options;
    },
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
    'config.debug.calculateTaskDuration': function calculateTaskDuration(value) {
      if (!value && this.config.export.taskDuration) {
        this.config.export.taskDuration = false;
      }
    },
  },
  created() {
    this.pullConfigFromStore();
    this.load();
  },
  activated() {
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
        this.$showError({
          title: 'Error saving settings',
          error: e,
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
        this.$showError({
          title: 'Error loading default settings',
          error: e,
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
