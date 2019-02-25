<template>
  <button
    :class="[{'is-loading': downloading}, size]"
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

export default {
  name: 'DownloadButton',
  props: {
    content: {
      type: Function,
      default: () => '',
    },
    type: {
      type: String,
      default: '',
    },
    filename: {
      type: String,
      default: 'download',
    },
    compact: {
      type: Boolean,
      default: false,
    },
    size: {
      type: String,
      default: '',
    },
    disabled: {
      type: Boolean,
      default: false,
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
  },
  methods: {
    async download() {
      const blob = new Blob([this.content()], { type: `${this.downloadType.mime};charset=utf-8` });
      const downloadId = await browser.downloads.download({
        url: URL.createObjectURL(blob),
        filename: `${this.filename}.${this.downloadType.extension}`,
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
