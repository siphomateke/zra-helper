<template>
  <ul>
    <li
      v-for="client of clients"
      :key="client.id">
      <b>{{ client.name }}</b>
      <ul>
        <li
          v-for="(failure, index) of clientFailures[client.id]"
          :key="index">
          <span>{{ failure.action }}</span>{{ ` - ` }}<span class="error">{{ failure.error }}</span>
        </li>
      </ul>
    </li>
  </ul>
</template>

<script>
import { mapGetters } from 'vuex';
import { errorToString } from '@/backend/errors';

export default {
  name: 'ClientActionFailures',
  computed: {
    ...mapGetters('clientActions', ['getActionById', 'retryableFailuresByClient']),
    ...mapGetters('clients', ['getClientById']),
    clients() {
      const clientIds = Object.keys(this.retryableFailuresByClient);
      return clientIds.map(id => this.getClientById(id));
    },
    clientFailures() {
      const clientFailures = {};
      for (const clientId of Object.keys(this.retryableFailuresByClient)) {
        const failures = this.retryableFailuresByClient[clientId];
        clientFailures[clientId] = [];
        for (const failure of failures) {
          const clientFailure = {
            action: this.getActionById(failure.actionId).name,
          };
          if (failure.error) {
            clientFailure.error = errorToString(failure.error);
          }
          clientFailures[clientId].push(clientFailure);
        }
      }
      return clientFailures;
    },
  },
};
</script>

<style lang="scss" scoped>
@import 'styles/variables.scss';

ul {
  margin: 0.5em 0;
  list-style: initial;
  padding-inline-start: 20px;
}
.error {
  color: $errorColor;
}
</style>
