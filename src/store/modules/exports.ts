import { exportFormats } from '@/backend/constants';
import { waitForDownloadToComplete } from '@/backend/utils';
import { Toast } from 'buefy/dist/components/toast';

/** @type {import('vuex').Module} */
const vuexModule = {
  namespaced: true,
  actions: {
    async download({ rootState, dispatch }, {
      data,
      format,
      filename,
      showSaveAsDialog = rootState.config.export.showSaveAsDialog,
    }) {
      const downloadType = exportFormats[format];
      const blob = new Blob([data], { type: `${downloadType.mime};charset=utf-8` });
      const fullFilename = `${filename}.${downloadType.extension}`;
      const downloadUrl = URL.createObjectURL(blob);
      const downloadId = await browser.downloads.download({
        url: downloadUrl,
        filename: fullFilename,
        saveAs: showSaveAsDialog,
      });
      try {
        await waitForDownloadToComplete(downloadId);
        URL.revokeObjectURL(downloadUrl);
        Toast.open({
          message: `Successfully downloaded '${fullFilename}'`,
          type: 'is-success',
        });
      } catch (error) {
        if (error.code !== 'USER_CANCELED') {
          dispatch('showError', {
            title: `Failed to download ${downloadType.name}`,
            error,
          }, { root: true });
        }
        // TODO: Consider logging the download error
      }
    },
  },
};
export default vuexModule;
