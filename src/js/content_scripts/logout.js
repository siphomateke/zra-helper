import { getElement } from './helpers/elements';
import { errorToJson } from '../errors';

browser.runtime.onMessage.addListener((message) => {
    return new Promise((resolve) => {
        if (message.command === 'logout') {
            try {
                // This must be before resolve so we can catch any errors
                const logoutButton = getElement('#headerContent>tbody>tr>td:nth-child(3)>a:nth-child(23)', 'logout button');
                resolve({});
                logoutButton.click();
            } catch (error) {
                resolve({error: errorToJson(error)});
            }
        }
    });
});