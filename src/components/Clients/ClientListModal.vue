<template>
  <b-modal
    :active.sync="showClientTableModal"
    has-modal-card
    width="100%"
  >
    <div class="modal-card">
      <header class="modal-card-head">
        <p class="modal-card-title">{{ `${title} (${clients.length})` }}</p>
        <b-input
          ref="search"
          v-model="internalSearch"
          type="search"
          placeholder="Search clients..."
          icon="search"
        />
      </header>
      <section class="modal-card-body">
        <template v-if="shownClients.length > 0">
          <template v-if="internalSearch.length > 0">
            <p>Found {{ shownClients.length }} client(s) matching your query</p>
          </template>
          <slot :clients="shownClients"/>
        </template>
        <section
          v-else
          class="section"
        >
          <EmptyMessage
            icon="frown"
            message="No clients found that match your query"
          />
        </section>
      </section>
    </div>
  </b-modal>
</template>

<script>
import EmptyMessage from '@/components/EmptyMessage.vue';

// FIXME: Get rid of lag when opening and closing modal.
// The lag is due to the modal being re-created every time it is opened.
export default {
  name: 'ClientListModal',
  components: {
    EmptyMessage,
  },
  props: {
    clients: {
      type: Array,
      default: () => [],
      required: true,
    },
    active: {
      type: Boolean,
      default: false,
    },
    title: {
      type: String,
      default: 'Clients',
    },
    buttonLabel: {
      type: String,
      default: '',
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
    };
  },
  computed: {
    searchableClientData() {
      return this.clients.map(client => ({
        name: client.name.toLowerCase(),
        username: client.username.toLowerCase(),
        password: client.password.toLowerCase(),
      }));
    },
    lowerCaseSearchStr() {
      return this.internalSearch.toLowerCase();
    },
    shownClients() {
      if (this.internalSearch) {
        const q = this.lowerCaseSearchStr;
        const matches = [];
        for (let i = 0; i < this.searchableClientData.length; i++) {
          const client = this.searchableClientData[i];
          if (
            client.name.includes(q)
            || client.username.includes(q)
            || client.password.includes(q)
          ) {
            matches.push(this.clients[i]);
          }
        }
        return matches;
      }
      return this.clients;
    },
  },
  watch: {
    search(value) {
      this.internalSearch = value;
    },
    active(value) {
      this.showClientTableModal = value;
    },
    showClientTableModal(value) {
      this.$emit('update:active', value);
      if (value) {
        this.$nextTick(() => {
          this.$refs.search.focus();
        });
      }
    },
  },
};
</script>
