<template>
  <div class="client-action-output">
    <div class="field">
      <label class="label">{{ action.name }} output</label>
      <template v-if="!loading">
        <div v-if="defaultOutput">
          <div class="control client-action-output-control">
            <textarea
              :value="defaultOutput"
              class="textarea"
              readonly
              rows="7"
            />
          </div>
          <ExportButtons
            :generators="generators"
            :default-format="defaultFormat"
            :filename="`${action.id}Output`"
          />
        </div>
        <div
          v-else
          class="bordered-section"
        >
          <EmptyMessage message="Output is empty"/>
        </div>
      </template>
      <div
        v-else
        class="bordered-section"
      >
        <LoadingMessage message="Getting output"/>
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
  data() {
    return {
      defaultOutput: null,
      clientOutputs: null,
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
  },
  watch: {
    defaultOutputFormat() {
      this.getDefaultOutput();
    },
    clientOutputs() {
      this.getDefaultOutput();
    },
    loading(loading) {
      if (!loading) {
        this.updateOutput();
      }
    },
  },
  created() {
    this.getDefaultOutput();
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
     * Gets a client that has a certain ID.
     * @param {string} id The ID of the client we wish to retreive.
     * @returns {import('@/backend/constants').Client}
     */
    clientFromId(id) {
      return this.clients[id];
    },
    /**
     * @param {import('@/backend/constants').ExportFormatCode} format
     */
    async formatOutput(format, anonymizeClients = false) {
      const clients = Object.keys(this.clients).map(id => this.clientFromId(id));
      return this.action.outputFormatter({
        clients,
        outputs: this.clientOutputs,
        format,
        anonymizeClients,
      });
    },
    async getDefaultOutput() {
      if (this.clientOutputs) {
        this.defaultOutput = await this.formatOutput(this.defaultFormat);
      }
    },
    updateOutput() {
      this.getClientOutputs();
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
  }
}
</style>
