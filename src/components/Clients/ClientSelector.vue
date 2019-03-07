<template>
  <div>
    <span>
      <b>Clients selected:</b>
      {{ selected.length }}
    </span>
    <b-table
      :data="clients"
      :mobile-cards="false"
      :checked-rows.sync="selected"
      checkable
      narrowed
    >
      <template slot-scope="{ row }">
        <b-table-column
          :sortable="true"
          field="name"
          label="Name"
        >{{ row.name }}</b-table-column>
        <b-table-column
          :sortable="true"
          field="username"
          label="Username"
        >{{ row.username }}</b-table-column>
      </template>
    </b-table>
  </div>
</template>

<script>
export default {
  name: 'ClientSelector',
  props: {
    clients: {
      type: Array,
      required: true,
    },
    value: {
      type: Array,
      default: () => [],
    },
  },
  data() {
    return {
      selected: this.value,
    };
  },
  watch: {
    selected(value) {
      this.$emit('input', value);
    },
    value() {
      this.selected = this.value;
    },
  },
};
</script>
