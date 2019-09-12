import { mapGetters } from 'vuex';
import Vue, { ComponentOptions } from 'vue';

const ClientIdsMixin: ComponentOptions<Vue> = {
  computed: {
    ...mapGetters('clients', ['getClientById']),
    clients() {
      return this.getClientsFromIds(this.clientIds);
    },
  },
  methods: {
    getClientsFromIds(ids) {
      return ids.map(id => this.getClientById(id));
    },
  },
};
export default ClientIdsMixin;
