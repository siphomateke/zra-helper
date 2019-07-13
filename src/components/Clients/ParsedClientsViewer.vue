<template>
  <ValidationErrorsTable
    :data="clientValidations"
    :columns="columns"
    invalid-string="This client is invalid."
  />
</template>

<script>
import { clientPropValidationErrorMessages } from '@/backend/constants';
import clientIdMixin from '@/mixins/client_ids';
import ValidationErrorsTable from '@/components/ValidationErrorsTable.vue';

export default {
  name: 'ParsedClientsViewer',
  components: {
    ValidationErrorsTable,
  },
  mixins: [clientIdMixin],
  props: {
    clientIds: {
      type: Array,
      default: () => [],
      required: true,
    },
  },
  data() {
    return {
      columns: [
        { field: 'name', label: 'Name' },
        { field: 'username', label: 'Username' },
        { field: 'password', label: 'Password' },
      ],
    };
  },
  computed: {
    clientValidations() {
      return this.clients.map((client) => {
        const { propErrors, ...client2 } = client;
        const fieldErrors = {};
        for (const prop of Object.keys(propErrors)) {
          fieldErrors[prop] = propErrors[prop].map(code => this.getErrorMessageFromCode(code));
        }
        return {
          ...client2,
          fieldErrors,
        };
      });
    },
  },
  methods: {
    getErrorMessageFromCode(code) {
      if (code in clientPropValidationErrorMessages) {
        return clientPropValidationErrorMessages[code];
      }
      return 'Unknown error';
    },
  },
};
</script>
