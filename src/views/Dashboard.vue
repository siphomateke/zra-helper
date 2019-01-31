<template>
  <div id="dashboard">
    <section class="hero is-primary is-bold is-small">
      <div class="hero-body">
        <div class="container">
          <h1 class="title">
            ZRA Helper
          </h1>
          <h2 class="subtitle">
            Dashboard
          </h2>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="dashboard container">
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
                  name="actions">
                  {{ action.name }}
                </b-checkbox>
              </div>
            </div>
            <button
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
            :clients="clients"/>
        </section>
      </div>
    </section>
  </div>
</template>

<script>
import ClientListFileUpload from '@/components/ClientList/ClientListFileUpload.vue';
import ClientList from '@/components/ClientList/ClientList.vue';
import TaskList from '@/components/TaskList.vue';
import Log from '@/components/TheLog.vue';
import ClientActionOutput from '@/components/ClientActionOutput.vue';
import { mapState } from 'vuex';

export default {
  name: 'Dashboard',
  components: {
    ClientListFileUpload,
    ClientList,
    TaskList,
    Log,
    ClientActionOutput,
  },
  data() {
    return {
      selectedClientActions: [],
      clients: [],
    };
  },
  computed: {
    ...mapState({
      tasks: state => state.tasks.all,
      clientActionsObject: state => state.clientActions.all,
    }),
    clientActionIds() {
      return Object.keys(this.clientActionsObject);
    },
    clientActions() {
      return this.clientActionIds.map(id => this.clientActionsObject[id]);
    },
    clientActionsWithOutputs() {
      return this.selectedClientActions.filter(id => this.clientActionsObject[id].hasOutput);
    },
  },
  methods: {
    submit() {
      this.$store.dispatch('clientActions/runAll', {
        actionIds: this.selectedClientActions,
        clients: this.clients,
      });
    },
    updateClients(clients) {
      this.clients = clients;
    },
  },
};
</script>
