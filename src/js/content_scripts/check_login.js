import { errorToJson, LoginError } from '../errors';

browser.runtime.onMessage.addListener((message) => {
    return new Promise((resolve) => {
        if (message.command === 'checkLogin') {
            // Detect general error
            const errorEl = document.querySelector('.error');
            if (errorEl) {
                resolve({error: errorToJson(new LoginError(errorEl.textContent))});
                return;
            }

            // Detect expired password error
            const loginErrorEl = document.querySelector('#loginAdminForm>p.tablerowhead');
            if (loginErrorEl) {
                const errorString = loginErrorEl.innerText;
                if (errorString) {
                    let error;
                    if (errorString.toLowerCase().includes('your password has expired')) {
                        error = new LoginError("Client's password has expired", 'PasswordExpired');
                    } else {
                        error = new LoginError(errorString);
                    }
                    resolve({error: errorToJson(error)});
                    return;
                }
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