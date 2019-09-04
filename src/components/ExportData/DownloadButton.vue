<template>
  <BaseExportButton
    :class="{'is-loading': loading}"
    v-bind="buttonProps"
    @click="download"
  />
</template>

<script>
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
    loading() {
      return this.generatingData || this.downloading;
    },
  },
  methods: {
    async download() {
      const data = await this.generateData();
      // Wait a little bit to see if the download finishes quickly before showing the
      // progress spinner so it doesn't flicker
      let done = false;
      setTimeout(() => {
        if (!done) {
          this.downloading = true;
        }
      }, 200);
      try {
        await this.$store.dispatch('exports/download', {
          data,
          format: this.format,
          filename: this.filename,
        });
      } finally {
        this.downloading = false;
        done = true;
      }
    },
  },
};
</script>
