import {ZraError, LoginError, errorToJson} from '../errors';

browser.runtime.onMessage.addListener((message) => {
    return new Promise((resolve) => {
        if (message.command === 'checkLogin') {
            const errorEl = document.querySelector('.error');
            if (errorEl) {
                let error = errorEl.innerText ? errorEl.innerText : errorEl.textContent;
                // TODO: Consider changing this to a LoginError
                resolve({error: errorToJson(new ZraError(error))});
                return;
            }

            const clientEl = document.querySelector('#headerContent>tbody>tr>td:nth-child(3)>p:nth-child(27)>b>label');
            if (clientEl) {
                const clientInfo = clientEl.innerText;
                const foundUsername = clientInfo.indexOf(message.client.username) > -1;
                if (foundUsername) {
                    // If we found the username in the client info, then we have successfully logged in
                    resolve({error: null});
                    return;
                } else {
                    resolve({error: errorToJson(new LoginError(`Still logged in as another client "${clientInfo}"`, 'WrongClient'))});
                    return;
                }
            }

            resolve({error: errorToJson(new LoginError('Unknown error logging in'))});
        }
    });
});