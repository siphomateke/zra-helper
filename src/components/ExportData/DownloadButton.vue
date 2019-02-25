<template>
  <button
    :class="[{'is-loading': loading}, size]"
    :title="description"
    :disabled="disabled"
    class="button"
    type="button"
    @click="download">
    <b-icon
      icon="download"
      size="is-small"/>
    <span v-if="!compact">{{ label }}</span>
  </button>
</template>

<script>
import { waitForDownloadToComplete } from '@/backend/utils';
import { exportFormats } from '@/backend/constants';
import ExportButtonMixin from './export_button_mixin';

export default {
  name: 'DownloadButton',
  mixins: [ExportButtonMixin],
  props: {
    type: {
      type: String,
      required: true,
    },
    filename: {
      type: String,
      default: 'download',
    },
  },
  data() {
    return {
      downloading: false,
      label: 'Download',
    };
  },
  computed: {
    downloadType() {
      return exportFormats[this.type];
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
      const downloadId = await browser.downloads.download({
        url: URL.createObjectURL(blob),
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
        this.$toast.open({
          message: `Successfully downloaded '${fullFilename}'`,
          type: 'is-success',
        });
      } catch (error) {
        if (error.code !== 'USER_CANCELED') {
          this.$toast.open({
            message: `Failed to download ${this.downloadType.name}: ${error.code}.`,
            type: 'is-danger',
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
