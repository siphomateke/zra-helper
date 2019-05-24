<template>
  <div>
    <BaseExportButton
      v-bind="buttonProps"
      @click="click"
    />
    <CardModal
      :active.sync="previewModalVisible"
      title="Export viewer"
    >
      <ExportViewer
        slot="body"
        :output="output"
        :format="format"
        :raw="showRawExport"
      />
      <b-checkbox
        v-if="format !== exportFormatCodes.TXT"
        slot="foot"
        v-model="showRawExport"
      >Show raw export</b-checkbox>
    </CardModal>
  </div>
</template>

<script>
import ExportButtonMixin from './export_button_mixin';
import BaseExportButton from './BaseExportButton.vue';
import CardModal from '@/components/CardModal.vue';
import ExportViewer from '@/components/ExportData/ExportViewer.vue';
import { exportFormatCodes } from '../../backend/constants';

// TODO: Move modal into portal in button so that the button is styled correctly.
export default {
  name: 'PreviewButton',
  components: {
    CardModal,
    ExportViewer,
    BaseExportButton,
  },
  mixins: [ExportButtonMixin],
  data() {
    return {
      label: 'Preview',
      description: 'Preview export',
      icon: 'search-plus',

      previewModalVisible: false,
      output: null,
      showRawExport: false,
      exportFormatCodes,
    };
  },
  methods: {
    async click() {
      this.output = await this.generateData();
      this.previewModalVisible = true;
    },
  },
};
</script>
