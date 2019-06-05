<template>
  <div class="client-action-output">
    <div class="field">
      <label class="label">{{ action.name }} output</label>
      <div class="bordered-section">
        <div v-if="!loading">
          <ExportButtons
            v-if="output"
            :generators="generators"
            :default-format="defaultFormat"
            :filename="`${action.id}Output`"
          />
          <b-field label="Output preview format">
            <div
              v-if="action.outputFormats.length < 8"
              class="control"
            >
              <b-radio
                v-for="format of action.outputFormats"
                :key="format"
                :native-value="format"
                v-model="selectedOutputFormat"
              >{{ getFormatName(format) }}</b-radio>
            </div>
            <b-select
              v-else
              v-model="selectedOutputFormat"
            >
              <option
                v-for="format of action.outputFormats"
                :key="format"
                :value="format"
              >{{ getFormatName(format) }}</option>
            </b-select>
          </b-field>
          <div
            v-if="output"
            class="control client-action-output-control"
          >
            <template v-if="outputGenerated">
              <ExportViewer
                :raw="displayRawOutput"
                :format="selectedOutputFormat"
                :output="output"
              />
              <b-field>
                <b-checkbox
                  v-if="selectedOutputFormat !== exportFormatCodes.TXT"
                  v-model="displayRawOutput"
                >Show raw output</b-checkbox>
              </b-field>
            </template>
            <div
              v-else-if="!outputGenerationErrorMessage"
              class="bordered-section"
            >
              <LoadingMessage message="Generating output preview"/>
            </div>
            <b-message
              v-if="outputGenerationErrorMessage"
              type="is-danger"
              title="Error generating output"
            >{{ outputGenerationErrorMessage }}</b-message>
          </div>
          <div
            v-else
            class="bordered-section"
          >
            <EmptyMessage message="Output is empty"/>
          </div>
        </div>
        <LoadingMessage
          v-else
          message="Getting output"
        />
      </div>
    </div>
  </div>
</template>

<script>
import ExportButtons from '@/components/ExportData/ExportButtons.vue';
import EmptyMessage from '@/components/EmptyMessage.vue';
import LoadingMessage from '@/components/LoadingMessage.vue';
import { mapGetters } from 'vuex';
import { exportFormats, exportFormatCodes } from '../backend/constants';
import ExportViewer from './ExportData/ExportViewer.vue';
import { errorToString } from '../backend/errors';

export default {
  name: 'ClientActionOutput',
  components: {
    ExportButtons,
    EmptyMessage,
    LoadingMessage,
    ExportViewer,
  },
  props: {
    runId: {
      type: Number,
      required: true,
    },
    actionId: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      output: null,
      selectedOutputFormat: null,
      clientOutputs: null,
      outputGenerated: false,
      exportFormatCodes,
      displayRawOutput: false,
      outputGenerationError: null,
    };
  },
  computed: {
    ...mapGetters('clientActions', [
      'getActionById',
      'getInstanceById',
      'getOutputsOfAction',
      'actionHasOutput',
    ]),
    /** @returns {import('@/store/modules/client_actions').ActionRun} */
    run() {
      return this.$store.state.clientActions.runs[this.runId];
    },
    loading() {
      return this.run.running && !this.actionHasOutput(this.runId, this.actionId);
    },
    clients() {
      return this.run.clients;
    },
    allClients() {
      return this.run.allClients;
    },
    action() {
      return this.getActionById(this.actionId);
    },
    defaultFormat() {
      return this.action.defaultOutputFormat;
    },
    anonymizeClientsInExports() {
      return this.$store.state.config.debug.anonymizeClientsInExports;
    },
    generators() {
      const generators = {};
      for (const format of this.action.outputFormats) {
        // `anonymizeClientsInExports` can't just be passed as an argument to formatOutput because
        // vue.js won't re-compute `generators` when `anonymizeClientsInExports` changes.
        if (this.anonymizeClientsInExports) {
          generators[format] = () => this.formatOutput(format, true);
        } else {
          generators[format] = () => this.formatOutput(format, false);
        }
      }
      return generators;
    },
    outputGenerationErrorMessage() {
      if (this.outputGenerationError) {
        return errorToString(this.outputGenerationError);
      }
      return null;
    },
  },
  watch: {
    selectedOutputFormat() {
      this.outputGenerated = false;
      this.getOutput();
    },
    defaultFormat: {
      immediate: true,
      handler(format) {
        this.selectedOutputFormat = format;
      },
    },
    clientOutputs() {
      this.getOutput();
    },
    loading(loading) {
      if (!loading) {
        this.updateOutput();
      }
    },
  },
  created() {
    this.getOutput();
  },
  methods: {
    /**
     * Gets the outputs of all this action's clients.
     * @returns {import('@/store/modules/client_actions').ClientActionOutputs}
     */
    getClientOutputs() {
      this.clientOutputs = this.getOutputsOfAction(this.runId, this.actionId);
    },
    /**
     * @param {import('@/backend/constants').ExportFormatCode} format
     */
    async formatOutput(format, anonymizeClients = false) {
      return this.action.outputFormatter({
        clients: this.clients,
        allClients: this.allClients,
        outputs: this.clientOutputs,
        format,
        anonymizeClients,
      });
    },
    async getOutput() {
      if (this.clientOutputs) {
        try {
          this.output = await this.formatOutput(this.selectedOutputFormat);
          this.outputGenerated = true;
          this.outputGenerationError = false;
        } catch (error) {
          this.outputGenerationError = error;
        }
      }
    },
    updateOutput() {
      this.getClientOutputs();
    },
    getFormatName(format) {
      return exportFormats[format].name;
    },
  },
};
</script>

<style lang="scss">
@import 'styles/variables.scss';

.client-action-output {
  width: 100%;
  margin-bottom: 0.5em;

  .client-action-output-control {
    margin-bottom: $export-buttons-margin;

    .export-viewer .scrollable-section {
      overflow-y: auto;
      max-height: 300px;
    }
  }
}
</style>
