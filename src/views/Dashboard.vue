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
          <ClientList
            v-if="clients.length > 0"
            :clients="clients"/>
        </div>
        <br>
        <div class="field">
          <label class="label">Select actions</label>
          <div
            v-for="action in clientActions"
            :key="action.id"
            class="control">
            <b-checkbox
              v-model="selectedClientActions"
              :native-value="action.id"
              :disabled="!actionSupportsCurrentBrowser(action.id)"
              :title="!actionSupportsCurrentBrowser(action.id) ? getUnsupportedBrowserString(action.id) : ''"
              name="actions">
              {{ action.name }}
            </b-checkbox>
          </div>
        </div>
        <button
          :disabled="runActionsButtonDisabled"
          :title="runActionsButtonDisabledReason"
          class="button is-primary"
          type="submit">Run selected action(s)</button>
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
        :is-root="true"/>
    </section>
    <section
      v-if="clientActionsWithOutputs.length > 0"
      class="dashboard-section">
      <h3 class="title is-4">Outputs</h3>
      <ClientActionOutput
        v-for="actionId in clientActionsWithOutputs"
        :key="actionId"
        :action-id="actionId"
        :clients="clientsObj"/>
    </section>
  </div>
</template>

<script>
import ClientListFileUpload from '@/components/ClientList/ClientListFileUpload.vue';
import ClientList from '@/components/ClientList/ClientList.vue';
import TaskList from '@/components/TaskList.vue';
import Log from '@/components/TheLog.vue';
import ClientActionOutput from '@/components/ClientActionOutput.vue';
import { mapState, mapGetters } from 'vuex';
import configMixin from '@/mixins/config';
import { browserNames } from '@/backend/constants';
import { joinSpecialLast } from '@/utils';

export default {
  name: 'Dashboard',
  components: {
    ClientListFileUpload,
    ClientList,
    TaskList,
    Log,
    ClientActionOutput,
  },
  mixins: [configMixin],
  data() {
    return {
      selectedClientActions: [],
    };
  },
  computed: {
    ...mapState({
      tasks: state => state.tasks.all,
      clientActionsObject: state => state.clientActions.all,
      clientsObj: state => state.clients.all,
    }),
    ...mapGetters('clientActions', [
      'actionSupportsCurrentBrowser',
      'getBrowsersActionSupports',
    ]),
    clients() {
      return Object.values(this.clientsObj);
    },
    clientActionIds() {
      return Object.keys(this.clientActionsObject);
    },
    clientActions() {
      return Object.values(this.clientActionsObject);
    },
    clientActionsWithOutputs() {
      return this.selectedClientActions.filter(id => this.clientActionsObject[id].hasOutput);
    },
    noActionsSelected() {
      return this.selectedClientActions.length === 0;
    },
    runActionsButtonDisabled() {
      return this.noActionsSelected;
    },
    runActionsButtonDisabledReason() {
      if (this.runActionsButtonDisabled) {
        return 'Please select some actions to run on the clients first.';
      }
      return '';
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
    getNamesOfBrowsersActionSupports(actionId) {
      return this.getBrowsersActionSupports(actionId).map(browserCode => browserNames[browserCode]);
    },
    getUnsupportedBrowserString(actionId) {
      const browsers = this.getNamesOfBrowsersActionSupports(actionId);
      return `This action can only be run in ${joinSpecialLast(browsers, ', ', ' or ')}`;
    },
  },
};
</script>
