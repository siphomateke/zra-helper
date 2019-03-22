import store from '@/store';
import config from '@/transitional/config';
import createTask from '@/transitional/tasks';
import { InvalidReceiptError } from '../errors';
import {
  closeTab,
  createTabPost,
  monitorDownloadProgress,
  runContentScript,
  saveAsMHTML,
  tabLoaded,
} from '../utils';
import { changeLiteMode, taskFunction } from './utils';

/**
 * Downloads a receipt
 * @param {Object} options
 * @param {'return'|'payment'} options.type
 * @param {string|string[]|Function} options.filename
 * Filename of the downloaded receipt.
 *
 * If an array of filenames is provided, multiple files will be downloaded.
 *
 * If a function is provided, it must return a string or array. It will be called with
 * an object containing information about the receipt such as reference number.
 * @param {string} options.taskTitle
 * @param {number} options.parentTaskId
 * @param {import('../utils').CreateTabPostOptions} options.createTabPostOptions
 */
export async function downloadReceipt({
  type, filename, taskTitle, parentTaskId, createTabPostOptions,
}) {
  const task = await createTask(store, {
    title: taskTitle,
    parent: parentTaskId,
    progressMax: 4,
    status: 'Opening receipt tab',
  });
  return taskFunction({
    task,
    async func() {
      const tab = await createTabPost(createTabPostOptions);
      try {
        task.addStep('Waiting for receipt to load');
        await tabLoaded(tab.id);

        const receiptData = await runContentScript(tab.id, 'get_receipt_data', { type });

        if (!receiptData.referenceNumber) {
          throw new InvalidReceiptError('Invalid receipt; missing reference number.');
        }

        task.addStep('Converting receipt to MHTML');
        const blob = await saveAsMHTML({ tabId: tab.id });
        const url = URL.createObjectURL(blob);
        task.addStep('Downloading generated MHTML');

        let generatedFilename;
        if (typeof filename === 'function') {
          generatedFilename = filename(receiptData);
        } else {
          generatedFilename = filename;
        }
        let generatedFilenames;
        if (typeof generatedFilename === 'string') {
          generatedFilenames = [generatedFilename];
        } else {
          generatedFilenames = generatedFilename;
        }
        const taskProgressBeforeDownload = task.progress;
        if (Array.isArray(generatedFilenames)) {
          const promises = [];
          for (const generatedFilename of generatedFilenames) {
            promises.push(new Promise(async (resolve) => {
              let downloadFilename = generatedFilename;
              if (!config.export.removeMhtmlExtension) {
                downloadFilename += '.mhtml';
              }
              const downloadId = await browser.downloads.download({
                url,
                filename: downloadFilename,
              });
              // FIXME: Catch and handle download errors
              await monitorDownloadProgress(downloadId, (downloadProgress) => {
                if (downloadProgress !== -1) {
                  task.progress = taskProgressBeforeDownload + downloadProgress;
                }
              });
              resolve();
            }));
          }
          await Promise.all(promises);
        } else {
          throw new Error('Invalid filename attribute; filename must be a string, array or function.');
        }
      } finally {
        // Don't need to wait for the tab to close to carry out logged in actions
        // TODO: Catch tab close errors
        closeTab(tab.id);
      }
    },
  });
}

export function startDownloadingReceipts() {
  return changeLiteMode(false);
}

export async function finishDownloadingReceipts() {
  return changeLiteMode(true);
}
