<template>
  <div class="export-viewer">
    <TextExportViewer
      v-if="raw"
      :format="format"
      :output="output"
    />
    <component
      :is="previewComponent"
      v-else
      :format="format"
      :output="output"
    />
  </div>
</template>

<script>
import { ExportFormatCode } from '../../backend/constants';
import TextExportViewer from './previews/TextExportViewer.vue';
import CsvExportViewer from './previews/CsvExportViewer.vue';
import JsonExportViewer from './previews/JsonExportViewer.vue';

const previewComponentFromFormat = {
  [ExportFormatCode.TXT]: TextExportViewer,
  [ExportFormatCode.CSV]: CsvExportViewer,
  [ExportFormatCode.JSON]: JsonExportViewer,
};

export default {
  name: 'ExportPreview',
  components: {
    TextExportViewer,
  },
  props: {
    format: {
      type: String,
      required: true,
    },
    output: {
      type: String,
      required: true,
    },
    /** Whether the raw output should be shown instead of a rendered one. */
    raw: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      ExportFormatCode,
    };
  },
  computed: {
    previewComponent() {
      if (this.format in previewComponentFromFormat) {
        return previewComponentFromFormat[this.format];
      }
      return TextExportViewer;
    },
  },
};
</script>

<style lang="scss" scoped>
.export-viewer:not(:last-child) {
  margin-bottom: 0.5rem;
}
</style>
