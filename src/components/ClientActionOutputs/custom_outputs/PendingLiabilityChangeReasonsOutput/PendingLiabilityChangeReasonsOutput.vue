<template>
  <div>
    <CardCollapse
      v-for="client in clientsWithReasonsResponses"
      :key="client.id"
      :title="client.name"
    >
      <CardCollapse
        v-for="taxTypeId in Object.keys(reasonsResponses[client.id])"
        :key="taxTypeId"
        :title="getTaxTypeName(taxTypeId)"
      >
        <LedgerLogicResponse :response="reasonsResponses[client.id][taxTypeId]" />
      </CardCollapse>
    </CardCollapse>
  </div>
</template>


<script>
import CardCollapse from '@/components/CardCollapse.vue';
import LedgerLogicResponse from './LedgerLogicResponse.vue';
import { taxTypes, taxTypeLabels } from '@/backend/constants';
import { validateClients } from '@/validation/props/client';

export default {
  name: 'PendingLiabilityChangeReasonsOutput',
  components: {
    CardCollapse,
    LedgerLogicResponse,
  },
  props: {
    clients: {
      type: Array,
      required: true,
      validator: validateClients,
    },
    /** Outputs of the action by client ID */
    outputs: {
      type: Object,
      required: true,
      // TODO: Validate
    },
  },
  computed: {
    reasonsResponses() {
      const reasonsResponses = {};
      for (const { id } of this.clients) {
        if (id in this.outputs) {
          const output = this.outputs[id].value;
          if (output && Object.keys(output.taxTypes).length > 0) {
            reasonsResponses[id] = output.taxTypes;
          }
        }
      }
      return reasonsResponses;
    },
    clientsById() {
      const map = {};
      for (const client of this.clients) {
        map[client.id] = client;
      }
      return map;
    },
    clientsWithReasonsResponses() {
      const clientIds = Object.keys(this.reasonsResponses);
      return clientIds.map(id => this.getClientById(id));
    },
  },
  methods: {
    getClientById(clientId) {
      return this.clientsById[clientId];
    },
    getTaxTypeName(taxTypeId) {
      return `${taxTypeLabels[taxTypeId]} (${taxTypes[taxTypeId]})`;
    },
  },
};
</script>
