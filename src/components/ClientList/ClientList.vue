<template>
  <div>
    <p>Parsed {{ clients.length }} valid client(s)</p>
    <button
      class="button"
      type="button"
      @click="showClientTableModal = !showClientTableModal">
      <span>View clients</span>
      <b-icon
        icon="angle-right"
        size="is-small"/>
    </button>
    <b-modal
      :active.sync="showClientTableModal"
      has-modal-card>
      <div class="modal-card">
        <header class="modal-card-head">
          <p class="modal-card-title">Clients ({{ clients.length }})</p>
          <b-input
            v-model="internalSearch"
            type="search"
            placeholder="Search clients..."
            icon="search"/>
        </header>
        <section class="modal-card-body">
          <template v-if="shownClients.length > 0">
            <template v-if="internalSearch.length > 0">
              <p>Found {{ shownClients.length }} client(s) matching your query</p>
              <br>
            </template>
            <ClientListTable
              :clients="shownClients"
              :show-passwords="showPasswords"/>
          </template>
          <section
            v-else
            class="section">
            <div class="content has-text-grey has-text-centered">
              <p>
                <b-icon
                  icon="frown"
                  size="is-large"/>
              </p>
              <p>No clients found that match your query</p>
            </div>
          </section>
        </section>
        <footer class="modal-card-foot">
          <ShowPasswordsButton
            v-model="showPasswords"
            :disabled="shownClients.length === 0"/>
        </footer>
      </div>
    </b-modal>
  </div>
</template>

<script>
import ClientListTable from './ClientListTable.vue';
import ShowPasswordsButton from './ClientListShowPasswordsButton.vue';

// FIXME: Get rid of lag when opening and closing modal.
// The lag is due to the modal being re-created every time it is opened.
export default {
  name: 'ClientList',
  components: {
    ClientListTable,
    ShowPasswordsButton,
  },
  props: {
    clients: {
      type: Array,
      default: () => [],
      required: true,
    },
    search: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      internalSearch: '',
      showClientTableModal: false,
      showPasswords: false,
    };
  },
  computed: {
    shownClients() {
      if (this.internalSearch) {
        const q = this.internalSearch.toLowerCase();
        return this.clients.filter(client => client.name.toLowerCase().includes(q)
          || client.username.toLowerCase().includes(q)
          || client.password.toLowerCase().includes(q));
      }
      return this.clients;
    },
  },
  watch: {
    search(value) {
      this.internalSearch = value;
    },
  },
};
</script>
