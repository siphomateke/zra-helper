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
              v-if="clients.length > 0"
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
        <ClientActionList
          v-model="selectedClientActions"
          :action-ids="selectedClientActions"
          :disabled="selectActionsDisabled"
          :inputs.sync="actionInputs"
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
      <div v-if="runsWithFailures.length > 0">
        <b-field>
          <p class="control">
            <span class="button is-static">Run No.</span>
          </p>
          <b-select v-model="failuresRunId">
            <option
              v-for="runId in runsWithFailures"
              :key="runId"
              :value="runId"
            >{{ runId + 1 }}</option>
          </b-select>
          <p class="control">
            <button
              :disabled="clientActionsRunning"
              class="button"
              type="button"
              @click="retryFailures(failuresRunId)"
            >
              <b-icon
                icon="redo"
                size="is-small"
              />
              <span>Retry failed clients</span>
            </button>
          </p>
          <p class="control">
            <OpenModalButton
              :disabled="failuresRunId === null"
              label="View failures"
              @click="showFailures"
            />
          </p>
        </b-field>
      </div>
    </section>
    <section
      v-if="anyRunsWithOutputs"
      class="dashboard-section"
    >
      <h3 class="title is-4">Outputs</h3>
      <div
        v-for="(run, runId) in runs"
        :key="runId"
      >
        <template v-if="actionsWithOutputsInRun(run).length > 0">
          <h4
            v-if="runs.length > 1"
            class="title is-5"
          >Run {{ runId + 1 }}</h4>
          <ClientActionOutput
            v-for="actionId in actionsWithOutputsInRun(run)"
            :key="actionId"
            :run-id="runId"
            :action-id="actionId"
          />
        </template>
      </div>
    </section>

    <template v-if="clients.length > 0">
      <ClientListModal
        :client-ids="clientIds"
        :active.sync="parsedClientsViewerVisible"
        title="Parsed clients"
      >
        <template slot-scope="{ clientIds }">
          <ParsedClientsViewer :client-ids="clientIds"/>
        </template>
      </ClientListModal>
      <ClientListModal
        :client-ids="clientIds"
        :active.sync="clientSelectorVisible"
        title="Client selector"
      >
        <template slot-scope="{ clientIds }">
          <ClientSelector
            v-model="selectedClientIds"
            :client-ids="clientIds"
            :disabled="clientActionsRunning"
          />
        </template>
      </ClientListModal>
    </template>
    <CardModal
      :active.sync="failuresModalVisible"
      title="Client failures"
    >
      <ClientActionFailures
        slot="body"
        :run-id="failuresRunId"
      />
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
import ClientActionList from '@/components/ClientActionList.vue';
import CardModal from '@/components/CardModal.vue';
import ClientActionFailures from '@/components/ClientActionFailures.vue';
import { mapState, mapGetters } from 'vuex';
import configMixin from '@/mixins/config';

// FIXME: Don't submit dashboard form when pressing enter in client action date inputs
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
    ClientActionList,
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
      failuresRunId: null,
      failuresModalVisible: false,
      actionInputs: {},
    };
  },
  computed: {
    ...mapState({
      tasks: state => state.tasks.all,
      clientsObj: state => state.clients.all,
    }),
    ...mapState(['zraLiteModeEnabled']),
    ...mapState('clientActions', {
      clientActionsObject: 'actions',
      runs: 'runs',
      instancesByActionId: 'instancesByActionId',
      currentRunId: 'currentRunId',
    }),
    ...mapGetters('clients', ['getClientById']),
    ...mapGetters('clientActions', {
      clientActionsRunning: 'running',
      getAnyRetryableFailures: 'getAnyRetryableFailures',
      runsWithFailures: 'runsWithFailures',
    }),
    currentRunFailed() {
      return this.runsWithFailures.includes(this.currentRunId);
    },
    clients() {
      return Object.values(this.clientsObj);
    },
    clientIds() {
      return Object.keys(this.clientsObj);
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
    anyRunsWithOutputs() {
      for (const run of this.runs) {
        if (this.actionsWithOutputsInRun(run).length > 0) {
          return true;
        }
      }
      return false;
    },
  },
  watch: {
    clientIds() {
      // Remove all the selected clients which no longer exist.
      for (let i = this.selectedClientIds.length - 1; i >= 0; i--) {
        const id = this.selectedClientIds[i];
        const client = this.getClientById(id);
        if (!client) {
          this.selectedClientIds.splice(i);
        }
      }
    },
    clientActionsRunning(running) {
      if (!running && this.currentRunFailed) {
        if (this.shouldPromptToRetryFailures) {
          this.$dialog.confirm({
            message: 'Some actions failed to run. Would you like to retry those that failed?',
            onConfirm: () => {
              this.retryFailures(this.currentRunId);
            },
            confirmText: 'Retry failed actions',
            cancelText: 'Cancel',
          });
        }
        this.failuresRunId = this.currentRunId;
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
        actionInputs: this.actionInputs,
      });
    },
    async updateClients(clients) {
      await this.$store.dispatch('clients/update', clients);

      // Select all clients by default
      this.selectedClientIds = this.clientIds;
    },
    async retryFailures(runId) {
      await this.$store.dispatch('clientActions/retryFailures', { runId });
    },
    showFailures() {
      this.failuresModalVisible = true;
    },
    actionsWithOutputsInRun(run) {
      const actionIds = Object.keys(run.instancesByActionId);
      return actionIds.filter(id => this.clientActionsObject[id].hasOutput);
    },
  },
};
</script>
