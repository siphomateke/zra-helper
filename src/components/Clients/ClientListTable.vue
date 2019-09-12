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

<script lang="ts">
import ExportButtons from '@/components/ExportData/ExportButtons.vue';
import { ExportFormatCode } from '@/backend/constants';
import { writeJson, renderTable, unparseCsv } from '@/backend/file_utils';
import { objectHasProperties } from '@/utils';

const exportFormats: ExportFormatCode[] = [
  ExportFormatCode.TXT,
  ExportFormatCode.CSV,
  ExportFormatCode.JSON,
];

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
          const { missing } = objectHasProperties(client, clientProperties);
          if (missing.length > 0) {
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
      if (format === ExportFormatCode.CSV || format === ExportFormatCode.TXT) {
        const table = this.clients.map(client => clientProperties.map(p => client[p]));
        table.unshift(tableColumns.map(column => column.label));

        if (format === ExportFormatCode.CSV) {
          return unparseCsv(table);
        }
        if (format === ExportFormatCode.TXT) {
          return renderTable(table);
        }
      }
      if (format === ExportFormatCode.JSON) {
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
