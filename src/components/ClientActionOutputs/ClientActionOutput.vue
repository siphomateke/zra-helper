<template>
  <div class="client-action-output">
    <div class="field">
      <label class="label">{{ action.name }} output</label>
      <div class="bordered-section">
        <LoadingMessage
          v-if="loading"
          message="Getting output"
        />
        <ExportButtons
          :generators="generators"
          :default-format="defaultFormat"
          :filename="`${action.id}Output`"
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

export default {
  name: 'ClientActionOutput',
  components: {
    ExportButtons,
    EmptyMessage,
    LoadingMessage,
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
  computed: {
    ...mapGetters('clientActions', [
      'getActionById',
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
    clientOutputs() {
      return this.getOutputsOfAction(this.runId, this.actionId);
    },
  },
  methods: {
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
