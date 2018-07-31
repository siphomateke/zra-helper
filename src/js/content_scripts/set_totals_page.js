import { errorToJson } from '../errors';
import { getElements } from './helpers/elements';

browser.runtime.onMessage.addListener((message) => {
    return new Promise((resolve) => {
        if (message.command === 'setPage') {
            try {
                const selectors = {
                    goToPageInputField: '#goToInpFld',
                    goToPageButton: '#navTable>tbody>tr:nth-child(2)>td:nth-child(6)>input.gotoPageBtn',
                };
                const els = getElements(selectors, '"Go to page" controls not found.');
                els.goToPageInputField.value = message.page;
                resolve({});
                els.goToPageButton.click();
            } catch (error) {
                resolve({error: errorToJson(error)});
            }
        }
    });
});