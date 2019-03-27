import { LoginError } from '../../errors';
import { getHtmlFromNode, getElementText } from './elements';

/**
 * Client's name and username in the format: "<name>  (<username>)""
 *
 * For example, "JOHN DOE  (1000000000)"
 * @typedef {string} ClientInfo
 */

/**
 * Gets the currently logged in client's information.
 * @param {Document|HTMLElement} root
 * @returns {ClientInfo|null}
 */
export function getClientInfo(root) {
  const clientEl = root.querySelector('#headerContent>tbody>tr>td:nth-child(3)>p:nth-child(27)>b>label');
  if (clientEl) {
    return clientEl.innerText;
  }
  return null;
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

/**
 *
 * @param {Document|HTMLElement} root
 * @param {import('@/backend/constants').Client} client
 */
export function checkLogin(root, client) {
  // Detect login errors such as expired password, invalid username and invalid password
  const expiredPasswordErrorEl = root.querySelector('#loginAdminForm>p.tablerowhead');
  const errorEl = root.querySelector('.error');
  if (expiredPasswordErrorEl || errorEl) {
    let errorString;
    if (expiredPasswordErrorEl) {
      errorString = getElementText(expiredPasswordErrorEl);
    } else {
      errorString = getElementText(errorEl);
    }
    if (errorString) {
      let error;
      const lowerCaseErrorString = errorString.toLowerCase();
      if (lowerCaseErrorString.includes('your password has expired')) {
        error = new LoginError("Client's password has expired", 'PasswordExpired', {
          clientName: client.username,
        });
      } else if (lowerCaseErrorString.includes('invalid login id or password')) {
        let errorMessage = 'Invalid login ID or password';
        const errorData = {
          clientName: client.username,
        };

        // Add extra information about the error if it's available.
        // This is mainly used to show the number of attempts left.
        const loginErrorDetailsEl = root.querySelector('#loginForm #layer1>table>tbody>tr.whitepapartdBig');
        if (loginErrorDetailsEl) {
          const loginErrorDetails = loginErrorDetailsEl.innerText;
          if (loginErrorDetails) {
            // extract number of attempts
            const numAttemptsMatch = loginErrorDetails.toLowerCase().match(/you have (\d+) attempt\(s\) left/);
            if (numAttemptsMatch) {
              const numAttempts = numAttemptsMatch[1];
              errorData.attemptsRemaining = numAttempts;
              if (numAttempts > 5) {
                errorMessage += `. You have ${numAttempts} attempt(s) left.`;
              } else {
                // eslint-disable-next-line max-len
                errorMessage += `. WARNING: You only have ${numAttempts} attempt(s) left. This client's account will be locked after ${numAttempts} attempt(s).`;
              }
            } else {
              errorMessage += `. ${loginErrorDetails}`;
            }
          }
        }

        error = new LoginError(errorMessage, 'InvalidUsernameOrPassword', errorData);
      } else {
        error = new LoginError(errorString, null, {
          clientName: client.username,
        });
      }
      throw error;
    }
  }

  const clientInfo = getClientInfo(root);
  if (clientInfo) {
    const foundUsername = usernameInClientInfo(client.username, clientInfo);
    // If we did not find the username in the client info, then another client
    // is already logged in.
    if (foundUsername) {
      return;
    }
    throw getWrongClientError(clientInfo);
  }
  // TODO: log no client info error

  throw new LoginError('Unknown error logging in', null, {
    clientName: client.username,
    documentString: getHtmlFromNode(root),
  });
}
