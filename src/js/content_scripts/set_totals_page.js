import { errorToJson } from '../errors';
import { getElement } from './helpers/elements';

browser.runtime.onMessage.addListener((message) => {
    return new Promise((resolve) => {
        if (message.command === 'setPage') {
            try {
                const lastPageButton = getElement('#navTable>tbody>tr:nth-child(2)>td:nth-child(5)>a', 'last page link');
                resolve({});
                lastPageButton.click();
            } catch (error) {
                resolve({error: errorToJson(error)});
            }
        }
    });
});