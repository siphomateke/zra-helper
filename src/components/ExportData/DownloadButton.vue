<template>
  <BaseExportButton
    :class="{'is-loading': loading}"
    v-bind="buttonProps"
    @click="download"
  />
</template>

<script>
import { waitForDownloadToComplete } from '@/backend/utils';
import { exportFormats } from '@/backend/constants';
import ExportButtonMixin from './export_button_mixin';
import BaseExportButton from './BaseExportButton.vue';

export default {
  name: 'DownloadButton',
  components: {
    BaseExportButton,
  },
  mixins: [ExportButtonMixin],
  props: {
    filename: {
      type: String,
      default: 'download',
    },
  },
  data() {
    return {
      downloading: false,
      label: 'Download',
      icon: 'download',
    };
  },
  computed: {
    downloadType() {
      return exportFormats[this.format];
    },
    description() {
      return `Download as ${this.downloadType.name}`;
    },
    showSaveAsDialog() {
      return this.$store.state.config.export.showSaveAsDialog;
    },
    loading() {
      return this.generatingData || this.downloading;
    },
  },
  methods: {
    async download() {
      const data = await this.generateData();
      const blob = new Blob([data], { type: `${this.downloadType.mime};charset=utf-8` });
      const fullFilename = `${this.filename}.${this.downloadType.extension}`;
      const downloadUrl = URL.createObjectURL(blob);
      const downloadId = await browser.downloads.download({
        url: downloadUrl,
        filename: fullFilename,
        saveAs: this.showSaveAsDialog,
      });
      // Wait a little bit to see if the download finishes quickly before showing the
      // progress spinner so it doesn't flicker
      let done = false;
      setTimeout(() => {
        if (!done) {
          this.downloading = true;
        }
      }, 200);
      try {
        await waitForDownloadToComplete(downloadId);
        URL.revokeObjectURL(downloadUrl);
        this.$toast.open({
          message: `Successfully downloaded '${fullFilename}'`,
          type: 'is-success',
        });
      } catch (error) {
        if (error.code !== 'USER_CANCELED') {
          this.$showError({
            title: `Failed to download ${this.downloadType.name}`,
            error,
          });
        }
        // TODO: Consider logging the download error
      } finally {
        this.downloading = false;
        done = true;
      }
    },
  },
};
</script>
