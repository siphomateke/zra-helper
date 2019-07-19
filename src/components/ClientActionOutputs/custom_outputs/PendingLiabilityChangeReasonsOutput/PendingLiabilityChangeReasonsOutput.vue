<template>
  <CardCollapse
    v-if="clientsWithReasonsResponses.length > 0"
    title="Processing errors"
  >
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
  </CardCollapse>
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
      for (const { id: clientId } of this.clients) {
        if (clientId in this.outputs) {
          const output = this.outputs[clientId].value;
          // Only add outputs that had errors checking for change reasons
          if (output && Object.keys(output.taxTypes).length > 0) {
            let anyErrors = false;
            const taxTypes = {};
            for (const taxTypeId of Object.keys(output.taxTypes)) {
              // eslint-disable-next-line max-len
              /** @type {import('@/backend/client_actions/tax_payer_ledger/logic').TaxPayerLedgerLogicFnResponse} */
              const response = output.taxTypes[taxTypeId];
              if (response.anyErrors) {
                taxTypes[taxTypeId] = response;
                anyErrors = true;
              }
            }
            if (anyErrors) {
              reasonsResponses[clientId] = taxTypes;
            }
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
