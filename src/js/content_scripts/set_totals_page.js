import { ElementNotFoundError, errorToJson } from '../errors';

browser.runtime.onMessage.addListener((message) => {
    return new Promise((resolve) => {
        if (message.command === 'setPage') {
            try {
                const goToPageInputField = document.querySelector('#goToInpFld');
                const goToPageButton = document.querySelector('#navTable>tbody>tr:nth-child(2)>td:nth-child(6)>input.gotoPageBtn');
                if (goToPageInputField && goToPageButton) {
                    goToPageInputField.value = message.page;
                    resolve({});
                    goToPageButton.click();
                } else {
                    throw new ElementNotFoundError('Failed to find go to page controls.');
                }
            } catch (error) {
                resolve({error: errorToJson(error)});
            }
        }
    });
});