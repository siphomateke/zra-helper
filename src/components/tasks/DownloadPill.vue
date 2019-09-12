<template>
  <div class="control">
    <div class="buttons has-addons">
      <button
        :class="{
          'is-danger': errorState,
          'is-loading': fetchingDownloadInfo || inProgress,
        }"
        :title="tooltip"
        class="button is-small download-pill"
        type="button"
        @click="openDownload"
      >
        <b-icon
          v-if="errorState"
          icon="exclamation-triangle"
          size="is-small"
        />
        <span>{{ content }}</span>
      </button>
      <button
        v-if="downloadExists"
        class="button is-small"
        type="button"
        title="Open containing folder"
        @click="openContainingFolder"
      >
        <b-icon
          icon="folder"
          size="is-small"
        />
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { errorToString } from '@/backend/errors';

interface ComponentData {
  download: browser.downloads.DownloadItem | null;
  inProgress: boolean;
  fetchingDownloadInfo: boolean;
  error: Error | null;
  downloadIdInvalid: boolean;
  fetchedDownloadInfo: boolean;
}

// TODO: Hide raw download.open errors in a collapsible section.
export default {
  props: {
    id: {
      type: Number,
      required: true,
    },
  },
  data(): ComponentData {
    return {
      download: null,
      inProgress: false,
      fetchingDownloadInfo: true,
      error: null,
      downloadIdInvalid: false,
      fetchedDownloadInfo: false,
    };
  },
  computed: {
    errorMessage() {
      return errorToString(this.error);
    },
    path() {
      if (this.fetchedDownloadInfo) {
        return this.download.filename;
      }
      return null;
    },
    filename() {
      if (this.fetchedDownloadInfo && this.path) {
        // eslint-disable-next-line no-useless-escape
        return this.path.replace(/^.*[\\\/]/, '');
      }
      return null;
    },
    content() {
      if (this.filename) {
        return this.filename;
      }
      if (this.error) {
        return 'Invalid download';
      }
      return 'Missing download';
    },
    tooltip() {
      if (this.path) {
        return this.path;
      }
      if (this.errorMessage) {
        return this.errorMessage;
      }
      return null;
    },
    errorState() {
      return !this.inProgress && (this.error !== null || !this.downloadExists);
    },
    downloadExists() {
      if (this.fetchedDownloadInfo) {
        return this.download.exists && !this.download.error;
      }
      return false;
    },
  },
  watch: {
    id: {
      immediate: true,
      handler() {
        this.fetchDownloadInfo();
      },
    },
  },
  created() {
    browser.downloads.onChanged.addListener((download) => {
      if (download.id === this.id) {
        if (download.state) {
          if (download.state.current === 'in_progress') {
            this.inProgress = true;
          } else {
            this.inProgress = false;
          }
        }
        this.fetchDownloadInfo();
      }
    });
  },
  methods: {
    async fetchDownloadInfo() {
      this.fetchingDownloadInfo = true;
      try {
        const downloads = await browser.downloads.search({ id: this.id });
        if (downloads.length > 0) {
          [this.download] = downloads;
          this.fetchedDownloadInfo = true;
        } else {
          this.downloadIdInvalid = true;
          throw new Error(`Couldn't find a download with ID '${this.id}'`);
        }
      } catch (error) {
        this.error = error;
      } finally {
        this.fetchingDownloadInfo = false;
      }
    },
    async openDownloadOrContainingFolder(folder) {
      let dialogTitle = 'Error opening download';
      if (folder) {
        dialogTitle += ' folder';
      }
      if (this.downloadExists) {
        try {
          if (folder) {
            await browser.downloads.show(this.id);
          } else {
            await browser.downloads.open(this.id);
          }
        } catch (error) {
          this.$showError({
            title: dialogTitle,
            error,
          });
        }
      } else {
        this.$showError({
          title: dialogTitle,
          message: this.errorMessage ? this.errorMessage : 'Download no longer exists.',
        });
      }
    },
    openContainingFolder() {
      return this.openDownloadOrContainingFolder(true);
    },
    openDownload() {
      return this.openDownloadOrContainingFolder(false);
    },
  },
};
</script>
