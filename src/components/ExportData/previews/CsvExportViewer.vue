<template>
  <div>
    <b-message
      v-if="errorMessage"
      type="is-danger"
      title="Failed to parse CSV output"
    >{{ errorMessage }}</b-message>
    <div
      v-else
      class="scrollable-section"
    >
      <table class="table is-narrow is-bordered is-fullwidth is-striped">
        <tbody>
          <tr
            v-for="(row, rowIndex) in rows"
            :key="rowIndex"
          >
            <td
              v-for="(column, columnIndex) in row"
              :key="columnIndex"
            >{{ column }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>


<script>
import Papa from 'papaparse';
import BaseExportViewer from './BaseExportViewer.vue';

export default {
  name: 'CsvExportViewer',
  extends: BaseExportViewer,
  data() {
    return {
      rows: [],
      errors: [],
    };
  },
  computed: {
    errorMessage() {
      return this.errors.join(',');
    },
  },
  watch: {
    output: {
      immediate: true,
      handler(output) {
        const parsed = Papa.parse(output);
        if (parsed.errors.length > 0) {
          this.errors = parsed.errors.map(error => error.message);
        } else {
          this.rows = parsed.data;
        }
      },
    },
  },
};
</script>
