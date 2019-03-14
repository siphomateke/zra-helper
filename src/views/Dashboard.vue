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
          <div class="buttons">
            <OpenModalButton
              v-if="clients.length > 0"
              label="View parsed clients"
              @click="parsedClientsViewerVisible = true"
            />
            <OpenModalButton
              v-if="validClientIds.length > 0"
              label="Select clients"
              @click="clientSelectorVisible = true"
            />
          </div>
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
    <section
      v-if="zraLiteModeEnabled"
      class="dashboard-section"
    >
      <b-message
        type="is-info"
        icon-size="small"
        has-icon
        headerless
      >The ZRA website is in basic HTML mode until all running tasks have completed.</b-message>
    </section>
    <section class="dashboard-section">
      <h3 class="title is-4">Tasks</h3>
      <TaskList
        :tasks="tasks"
        :is-root="true"
      />
    </section>
    <section class="dashboard-section">
      <div
        v-if="!clientActionsRunning && anyRetryableFailures"
        class="buttons has-addons"
      >
        <button
          class="button"
          type="button"
          @click="retryFailures"
        >
          <b-icon
            icon="redo"
            size="is-small"
          />
          <span>Retry failed clients</span>
        </button>
        <OpenModalButton
          label="View failures"
          @click="showFailures"
        />
      </div>
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
        :loading="clientActionsRunning"
      />
    </section>

    <ClientListModal
      v-if="clients.length > 0"
      :client-ids="clientIds"
      :active.sync="parsedClientsViewerVisible"
      title="Parsed clients"
    >
      <template slot-scope="{ clientIds }">
        <ParsedClientsViewer :client-ids="clientIds"/>
      </template>
    </ClientListModal>
    <ClientListModal
      v-if="validClientIds.length > 0"
      :client-ids="validClientIds"
      :active.sync="clientSelectorVisible"
      title="Valid clients"
    >
      <template slot-scope="{ clientIds }">
        <ClientSelector
          v-model="selectedClientIds"
          :client-ids="clientIds"
          :disabled="clientActionsRunning"
        />
      </template>
    </ClientListModal>
    <CardModal
      :active.sync="failuresModalVisible"
      title="Client failures">
      <ClientActionFailures slot="body"/>
    </CardModal>
  </div>
</template>

<script>
import ClientListFileUpload from '@/components/Clients/ClientListFileUpload.vue';
import ClientListModal from '@/components/Clients/ClientListModal.vue';
import ParsedClientsViewer from '@/components/Clients/ParsedClientsViewer.vue';
import ClientSelector from '@/components/Clients/ClientSelector.vue';
import OpenModalButton from '@/components/OpenModalButton.vue';
import TaskList from '@/components/TaskList.vue';
import Log from '@/components/TheLog.vue';
import ClientActionOutput from '@/components/ClientActionOutput.vue';
import ClientActionSelector from '@/components/ClientActionSelector.vue';
import CardModal from '@/components/CardModal.vue';
import ClientActionFailures from '@/components/ClientActionFailures.vue';
import { mapState, mapGetters } from 'vuex';
import configMixin from '@/mixins/config';

export default {
  name: 'Dashboard',
  components: {
    ClientListFileUpload,
    ClientListModal,
    ParsedClientsViewer,
    ClientSelector,
    OpenModalButton,
    TaskList,
    Log,
    ClientActionOutput,
    ClientActionSelector,
    CardModal,
    ClientActionFailures,
  },
  mixins: [configMixin],
  data() {
    return {
      selectedClientIds: [],
      selectedClientActions: [],
      parsedClientsViewerVisible: false,
      clientSelectorVisible: false,
      failuresModalVisible: false,
    };
  },
  computed: {
    ...mapState({
      tasks: state => state.tasks.all,
      clientActionsObject: state => state.clientActions.actions,
      clientsObj: state => state.clients.all,
    }),
    ...mapState(['zraLiteModeEnabled']),
    ...mapGetters('clients', ['getClientById']),
    ...mapGetters('clientActions', {
      anyRetryableFailures: 'anyRetryableFailures',
      clientActionsRunning: 'running',
    }),
    clients() {
      return Object.values(this.clientsObj);
    },
    clientIds() {
      return Object.keys(this.clientsObj);
    },
    validClientIds() {
      const valid = [];
      for (const client of this.clients) {
        if (client.valid) {
          valid.push(client.id);
        }
      }
      return valid;
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
      }
      if (this.clientActionsRunning) {
        return 'Some client actions are still running. Please wait for them to finish before running some more.';
      }
      return '';
    },
    selectActionsDisabled() {
      return this.clientActionsRunning;
    },
    shouldPromptToRetryFailures() {
      return this.$store.state.config.promptRetryActions;
    },
  },
  watch: {
    validClientIds() {
      // Remove all the selected clients which are no longer valid or don't exist.
      for (let i = this.selectedClientIds.length - 1; i >= 0; i--) {
        const id = this.selectedClientIds[i];
        const client = this.getClientById(id);
        if (!client || !client.valid) {
          this.selectedClientIds.splice(i);
        }
      }
    },
    clientActionsRunning(running) {
      if (this.shouldPromptToRetryFailures && !running && this.anyRetryableFailures) {
        this.$dialog.confirm({
          message: 'Some actions failed to run. Would you like to retry those that failed?',
          onConfirm: this.retryFailures,
          confirmText: 'Retry failed actions',
          cancelText: 'Cancel',
        });
      }
    },
  },
  created() {
    this.loadConfig();
  },
  methods: {
    async submit() {
      await this.$store.dispatch('clientActions/runSelectedActionsOnAllClients', {
        actionIds: this.selectedClientActions,
        clientIds: this.selectedClientIds,
      });
    },
    async updateClients(clients) {
      await this.$store.dispatch('clients/update', clients);

      // Select all clients by default
      this.selectedClientIds = this.validClientIds;
    },
    async retryFailures() {
      await this.$store.dispatch('clientActions/retryFailures');
    },
    showFailures() {
      this.failuresModalVisible = true;
    },
  },
};
</script>
