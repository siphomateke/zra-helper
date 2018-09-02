import { Task, taskStates } from '../tasks';
import { createTabPost, saveAsMHTML, tabLoaded, waitForDownloadToComplete } from '../utils';

export async function downloadReceipt({filename, taskTitle, parentTask, createTabPostOptions}) {
    const task = new Task(taskTitle, parentTask.id);
    task.progressMax = 4;
    task.status = 'Opening receipt tab';
    try {
        const tab = await createTabPost(createTabPostOptions);
        try {
            task.addStep('Waiting for receipt to load');
            await tabLoaded(tab.id);
            task.addStep('Converting receipt to MHTML');
            const blob = await saveAsMHTML({tabId: tab.id});
            const url = URL.createObjectURL(blob);
            task.addStep('Downloading generated MHTML');
            const downloadId = await browser.downloads.download({
                url, 
                filename,
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