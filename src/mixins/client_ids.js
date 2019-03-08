import { mapGetters } from 'vuex';

/** @type {import('vue').ComponentOptions} */
const mixin = {
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
export default mixin;
