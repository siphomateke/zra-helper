import { getElement } from './helpers/elements';
import { errorToJson } from '../errors';

browser.runtime.onMessage.addListener((message) => {
    return new Promise((resolve) => {
        if (message.command === 'goToLogin') {
            try {
                // This must be before resolve so we can catch any errors
                const button = getElement('#leftMainDiv>tbody>tr:nth-child(2)>td>div>div>div:nth-child(2)>table>tbody>tr:nth-child(1)>td:nth-child(1)>ul>li>a', 'go to login button');
                resolve({});
                button.click();
            } catch (error) {
                resolve({error: errorToJson(error)});
            }
        }
    });
});