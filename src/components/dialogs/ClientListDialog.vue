<template>
  <BaseDialog
    v-bind="$attrs"
    :can-cancel="false"
    scrollable
    v-on="$listeners"
    @confirm="confirm"
  >
    <p>{{ confirmMessage }}</p>
    <ClientListTable :clients="clients"/>
  </BaseDialog>
</template>

<script>
import BaseDialog from '@/components/dialogs/BaseDialog.vue';
import ClientListTable from '@/components/Clients/ClientListTable.vue';

export default {
  name: 'ListDialog',
  components: {
    BaseDialog,
    ClientListTable,
  },
  props: {
    clients: {
      type: Array,
      default: () => [],
    },
    confirmMessage: {
      type: String,
      default: '',
    },
  },
  methods: {
    confirm() {
      this.$emit('confirm');
      this.$emit('close');
    },
  },
};
</script>
