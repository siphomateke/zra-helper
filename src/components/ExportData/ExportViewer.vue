<template>
  <div class="export-viewer">
    <TextExportViewer
      v-if="raw"
      :format="format"
      :output="output"
    />
    <component
      v-else
      :is="previewComponent"
      :format="format"
      :output="output"
    />
  </div>
</template>

<script>
import { exportFormatCodes } from '../../backend/constants';
import TextExportViewer from './previews/TextExportViewer.vue';
import CsvExportViewer from './previews/CsvExportViewer.vue';
import JsonExportViewer from './previews/JsonExportViewer.vue';

const previewComponentFromFormat = {
  [exportFormatCodes.TXT]: TextExportViewer,
  [exportFormatCodes.CSV]: CsvExportViewer,
  [exportFormatCodes.JSON]: JsonExportViewer,
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
      exportFormatCodes,
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
