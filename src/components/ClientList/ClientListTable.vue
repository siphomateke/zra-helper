<template>
  <b-table
    :data="clients"
    narrowed>
    <template slot-scope="props">
      <b-table-column
        field="name"
        label="Name">
        {{ props.row.name }}
      </b-table-column>
      <b-table-column
        field="username"
        label="Username">
        {{ props.row.username }}
      </b-table-column>
      <b-table-column
        field="password"
        label="Password">
        <b-input
          v-if="!showPasswords"
          key="password-toggleable"
          :value="props.row.password"
          type="password"
          password-reveal
          readonly/>
        <b-input
          v-else
          key="visible-password"
          :value="props.row.password"
          type="text"
          readonly/>
      </b-table-column>
    </template>
  </b-table>
</template>

<script>
export default {
  name: 'ClientListTable',
  props: {
    clients: {
      type: Array,
      default: () => [],
      required: true,
    },
    showPasswords: {
      type: Boolean,
      default: false,
    },
  },
};
</script>
