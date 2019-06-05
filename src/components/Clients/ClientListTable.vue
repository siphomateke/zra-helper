<template>
  <div>
    <b-table
      :data="clients"
      :columns="columns"
      :mobile-cards="false"
      narrowed
    />
    <ExportButtons
      :generators="exportGenerators"
      :disabled="clients.length === 0"
      filename="clients"
    />
  </div>
</template>

<script>
import ExportButtons from '@/components/ExportData/ExportButtons.vue';
import { exportFormatCodes } from '@/backend/constants';
import { writeJson, renderTable, unparseCsv } from '@/backend/file_utils';
import { objectHasProperties } from '@/utils';

/** @type {import('@/backend/constants').ExportFormatCode[]} */
const exportFormats = [exportFormatCodes.TXT, exportFormatCodes.CSV, exportFormatCodes.JSON];

const tableColumns = [
  {
    field: 'id',
    label: 'ID',
    sortable: true,
  },
  {
    field: 'name',
    label: 'Name',
    sortable: true,
  },
  {
    field: 'username',
    label: 'Username',
    sortable: true,
  },
  {
    field: 'password',
    label: 'Password',
    sortable: true,
  },
];

/** Client properties used in table and exports */
const clientProperties = tableColumns.map(column => column.field);

export default {
  name: 'ClientListTable',
  components: {
    ExportButtons,
  },
  props: {
    clients: {
      type: Array,
      default: () => [],
      validator(value) {
        for (const client of value) {
          if (!objectHasProperties(client, clientProperties)) {
            return false;
          }
        }
        return true;
      },
    },
  },
  data() {
    return {
      columns: tableColumns,
    };
  },
  computed: {
    exportGenerators() {
      const generators = {};
      for (const format of exportFormats) {
        generators[format] = () => this.getExport(format);
      }
      return generators;
    },
  },
  methods: {
    getExport(format) {
      if (format === exportFormatCodes.CSV || format === exportFormatCodes.TXT) {
        const table = this.clients.map(client => clientProperties.map(p => client[p]));
        table.unshift(tableColumns.map(column => column.label));

        if (format === exportFormatCodes.CSV) {
          return unparseCsv(table);
        }
        if (format === exportFormatCodes.TXT) {
          return renderTable(table);
        }
      }
      if (format === exportFormatCodes.JSON) {
        const jsonExport = this.clients.map((client) => {
          const jsonClient = {};
          clientProperties.forEach((p) => {
            jsonClient[p] = client[p];
          });
          return jsonClient;
        });
        return writeJson(jsonExport);
      }
      return null;
    },
  },
};
</script>
