import { LoginError } from '../../errors';

/**
 * Client's name and username in the format: "<name>  (<username>)""
 * 
 * For example, "JOHN DOE  (1000000000)"
 * @typedef {string} ClientInfo
 */

/**
 * Gets the currently logged in client's information.
 * @returns {ClientInfo|null}
 */
export function getClientInfo() {
    const clientEl = document.querySelector('#headerContent>tbody>tr>td:nth-child(3)>p:nth-child(27)>b>label');
    if (clientEl) {
        return clientEl.innerText;
    } else {
        return null;
    }
}

/**
 * Checks if the specified username exists in a client's information.
 * @param {string} username 
 * @param {ClientInfo} clientInfo 
 */
export function usernameInClientInfo(username, clientInfo) {
    return clientInfo.indexOf(username) > -1;
}

/**
 * Creates a WrongClient error.
 * @param {ClientInfo} clientInfo Currently logged in client's information.
 * @returns {LoginError}
 */
export function getWrongClientError(clientInfo) {
    return new LoginError(`Still logged in as another client "${clientInfo}"`, 'WrongClient', {
        loggedInClient: clientInfo,
    });
}