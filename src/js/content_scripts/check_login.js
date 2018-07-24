import { errorToJson, LoginError } from '../errors';
import { getWrongClientError, getClientInfo, usernameInClientInfo } from './helpers/check_login';

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

            const clientInfo = getClientInfo();
            if (clientInfo) {
                const foundUsername = usernameInClientInfo(message.client.username, clientInfo);
                // If we did not find the username in the client info, then another client
                // is already logged in.
                if (foundUsername) {
                    resolve({error: null});
                    return;
                } else {
                    resolve({error: errorToJson(getWrongClientError(clientInfo))});
                    return;
                }
            }
            // TODO: log no client info error

            resolve({error: errorToJson(new LoginError('Unknown error logging in'))});
        }
    });
});