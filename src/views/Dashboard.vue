<template>
  <div id="dashboard">
    <section class="dashboard-section">
      <form @submit.prevent="submit">
        <div>
          <div class="field">
            <label class="label">Client list</label>
            <div class="control">
              <ClientListFileUpload @input="updateClients"/>
            </div>
          </div>
          <OpenModalButton
            v-if="clients.length > 0"
            label="View parsed clients"
            @click="parsedClientsViewerVisible = true"
          />
        </div>
        <br>
        <ClientActionSelector
          v-model="selectedClientActions"
          :disabled="selectActionsDisabled"
        />
        <button
          :disabled="runActionsButtonDisabled"
          :title="runActionsButtonDisabledReason"
          class="button is-primary"
          type="submit"
        >Run selected action(s)</button>
      </form>
    </section>
    <section class="dashboard-section">
      <h3 class="title is-4">Log</h3>
      <Log/>
    </section>
    <section class="dashboard-section">
      <h3 class="title is-4">Tasks</h3>
      <TaskList
        :tasks="tasks"
        :is-root="true"
      />
    </section>
    <section
      v-if="clientActionsWithOutputs.length > 0"
      class="dashboard-section"
    >
      <h3 class="title is-4">Outputs</h3>
      <ClientActionOutput
        v-for="actionId in clientActionsWithOutputs"
        :key="actionId"
        :action-id="actionId"
        :clients="clientsObj"
      />
    </section>


    <ClientListModal
      v-if="clients.length > 0"
      :clients="clients"
      :active.sync="parsedClientsViewerVisible"
      title="Parsed clients"
    >
      <template slot-scope="{ clients }">
        <ParsedClientsViewer :clients="clients"/>
      </template>
    </ClientListModal>
  </div>
</template>

<script>
import ClientListFileUpload from '@/components/Clients/ClientListFileUpload.vue';
import ClientListModal from '@/components/Clients/ClientListModal.vue';
import ParsedClientsViewer from '@/components/Clients/ParsedClientsViewer.vue';
import OpenModalButton from '@/components/OpenModalButton.vue';
import TaskList from '@/components/TaskList.vue';
import Log from '@/components/TheLog.vue';
import ClientActionOutput from '@/components/ClientActionOutput.vue';
import ClientActionSelector from '@/components/ClientActionSelector.vue';
import { mapState } from 'vuex';
import configMixin from '@/mixins/config';

export default {
  name: 'Dashboard',
  components: {
    ClientListFileUpload,
    ClientListModal,
    ParsedClientsViewer,
    OpenModalButton,
    TaskList,
    Log,
    ClientActionOutput,
    ClientActionSelector,
  },
  mixins: [configMixin],
  data() {
    return {
      selectedClientActions: [],
      parsedClientsViewerVisible: false,
    };
  },
  computed: {
    ...mapState({
      tasks: state => state.tasks.all,
      clientActionsObject: state => state.clientActions.all,
      clientsObj: state => state.clients.all,
    }),
    clients() {
      return Object.values(this.clientsObj);
    },
    clientActionsWithOutputs() {
      return this.selectedClientActions.filter(id => this.clientActionsObject[id].hasOutput);
    },
    noActionsSelected() {
      return this.selectedClientActions.length === 0;
    },
    runActionsButtonDisabled() {
      return this.noActionsSelected || this.clientActionsRunning;
    },
    runActionsButtonDisabledReason() {
      if (this.noActionsSelected) {
        return 'Please select some actions to run on the clients first.';
      } else if (this.clientActionsRunning) {
        return 'Some client actions are still running. Please wait for them to finish before running some more.';
      }
      return '';
    },
    clientActionsRunning() {
      return this.$store.getters['clientActions/running'];
    },
    selectActionsDisabled() {
      return this.clientActionsRunning;
    },
  },
  created() {
    this.loadConfig();
  },
  methods: {
    submit() {
      this.$store.dispatch('clientActions/runAll', {
        actionIds: this.selectedClientActions,
        clients: this.clients,
      });
    },
    updateClients(clients) {
      this.$store.dispatch('clients/update', clients);
    },
  },
};
</script>
