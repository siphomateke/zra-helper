<template>
  <div>
    <span>
      <b>Clients selected:</b>
      {{ selected.length }}
    </span>
    <b-table
      :data="clients"
      :mobile-cards="false"
      :checked-rows="selected"
      :is-row-checkable="isRowCheckable"
      checkable
      narrowed
      @update:checkedRows="updateCheckedRows"
    >
      <template slot-scope="{ row }">
        <b-table-column
          :sortable="true"
          field="id"
          label="ID"
        >
          {{ row.id }}
        </b-table-column>
        <b-table-column
          :sortable="true"
          field="name"
          label="Name"
        >
          {{ row.name }}
        </b-table-column>
        <b-table-column
          :sortable="true"
          field="username"
          label="Username"
        >
          {{ row.username }}
        </b-table-column>
        <b-table-column
          :sortable="true"
          field="password"
          label="Password"
        >
          {{ row.password }}
        </b-table-column>
      </template>
    </b-table>
  </div>
</template>

<script lang="ts">
import clientIdMixin from '@/mixins/client_ids';
import { Client } from '@/backend/constants';

interface ComponentData {
  selected: Client[];
  /** Client IDs */
  selectedIds: number[];
}

export default {
  name: 'ClientSelector',
  mixins: [clientIdMixin],
  props: {
    clientIds: {
      type: Array,
      required: true,
    },
    value: {
      type: Array,
      default: () => [],
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  data(): ComponentData {
    return {
      selected: [],
      selectedIds: this.value,
    };
  },
  watch: {
    value(value) {
      this.selectedIds = value;
    },
    selectedIds(value) {
      this.updateSelected(value);
      this.$emit('input', value);
    },
  },
  created() {
    this.updateSelected(this.selectedIds);
  },
  methods: {
    updateCheckedRows(clients) {
      this.selectedIds = clients.map(client => client.id);
    },
    updateSelected(ids) {
      this.selected = this.getClientsFromIds(ids);
    },
    isRowCheckable() {
      return !this.disabled;
    },
  },
};
</script>
