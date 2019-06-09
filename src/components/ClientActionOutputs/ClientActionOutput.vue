<template>
  <div class="client-action-output">
    <div class="field">
      <label class="label">{{ action.name }} output</label>
      <div class="bordered-section">
        <LoadingMessage
          v-if="loading"
          message="Getting output"
        />
        <ClientActionOutputFileWrapper
          v-for="(outputFile, idx) in outputFiles"
          :key="idx"
          :clients="clients"
          :action-id="actionId"
          :output-file="outputFile"
          :is-only-output="outputFiles.length === 1 && outputFile.children.length === 0"
        />
      </div>
    </div>
  </div>
</template>

<script>
import LoadingMessage from '@/components/LoadingMessage.vue';
import ClientActionOutputFileWrapper from './ClientActionOutputFileWrapper.vue';
import { mapGetters } from 'vuex';

export default {
  name: 'ClientActionOutput',
  components: {
    LoadingMessage,
    ClientActionOutputFileWrapper,
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
    clientOutputs() {
      return this.getOutputsOfAction(this.runId, this.actionId);
    },
    outputFiles() {
      if (this.clientOutputs) {
        return this.action.generateOutputFiles({
          clients: this.clients,
          allClients: this.allClients,
          outputs: this.clientOutputs,
        });
      }
      return null;
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
