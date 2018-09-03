import { Task, taskStates } from '../tasks';
import { createTabPost, saveAsMHTML, tabLoaded, waitForDownloadToComplete, executeScript, sendMessage } from '../utils';

export async function downloadReceipt({type, filename, taskTitle, parentTask, createTabPostOptions}) {
    const task = new Task(taskTitle, parentTask.id);
    task.progressMax = 4;
    task.status = 'Opening receipt tab';
    try {
        const tab = await createTabPost(createTabPostOptions);
        try {
            task.addStep('Waiting for receipt to load');
            await tabLoaded(tab.id);

            await executeScript(tab.id, {file: 'get_receipt_data.js'});
            const receiptData = await sendMessage(tab.id, { 
                command: 'getReceiptData',
                type,
            });

            task.addStep('Converting receipt to MHTML');
            const blob = await saveAsMHTML({tabId: tab.id});
            const url = URL.createObjectURL(blob);
            task.addStep('Downloading generated MHTML');

            let generatedFilename;
            if (typeof filename === 'string') {
                generatedFilename = filename;
            } else if (typeof filename === 'function') {
                generatedFilename = filename(receiptData);
            } else {
                throw new Error('Invalid filename attribute; filename must be a string or function.');
            }

            const downloadId = await browser.downloads.download({
                url, 
                filename: generatedFilename,
            });
            // TODO: Show download progress
            await waitForDownloadToComplete(downloadId);
            task.state = taskStates.SUCCESS;
            task.status = '';
        } finally {
            // Don't need to wait for the tab to close to carry out logged in actions
            // TODO: Catch tab close errors
            browser.tabs.remove(tab.id);
        }
    } catch (error) {
        task.setError(error);
        throw error;
    } finally {
        task.complete = true;
    }
}