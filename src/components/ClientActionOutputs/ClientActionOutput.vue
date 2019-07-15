<template>
  <div class="client-action-output">
    <div class="field">
      <div class="bordered-section">
        <label class="label">{{ action.name }} output</label>
        <ClientActionOutputFileWrapper
          :clients="clients"
          :action-id="actionId"
          :output-file="rootOutputFile"
          :loading="loading"
          :is-only-output="isOnlyOutput"
        />
        <br>
        <ClientActionOutputComponent
          :clients="allClients"
          :outputs="clientOutputs"
          :action-id="actionId"
        />
      </div>
    </div>
  </div>
</template>

<script>
import { mapGetters } from 'vuex';
import ClientActionOutputFileWrapper from './ClientActionOutputFileWrapper.vue';
import ClientActionOutputComponent from './ClientActionOutputComponent.vue';

export default {
  name: 'ClientActionOutput',
  components: {
    ClientActionOutputFileWrapper,
    ClientActionOutputComponent,
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
    isOnlyOutput() {
      return this.rootOutputFile.children.length === 0;
    },
    rootOutputFile() {
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
