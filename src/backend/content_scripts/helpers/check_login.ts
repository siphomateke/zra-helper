import { LoginError } from '../../errors';
import { getHtmlFromNode, getElementText } from './elements';
import { Client } from '@/backend/constants';

/**
 * Client's name and username in the format: "<name>  (<username>)""
 *
 * For example, "JOHN DOE  (1000000000)"
 */
type ClientInfo = string;

/**
 * Gets the currently logged in client's information.
 */
export function getClientInfo(root: HTMLDocument | HTMLElement): ClientInfo | null {
  const clientEl = <HTMLElement | null>(
    root.querySelector('#headerContent>tbody>tr>td:nth-child(3)>p:nth-child(27)>b>label')
  );
  if (clientEl) {
    return clientEl.innerText;
  }
  return null;
}

/**
 * Gets the date when a client's password will expire.
 */
export function getPasswordExpiryDate(root: HTMLDocument | HTMLElement) {
  const passwordExpiryEl = <HTMLElement | null>(
    root.querySelector('#headerContent>tbody>tr>td:nth-child(3)>p:nth-child(29)>b>label')
  );
  if (passwordExpiryEl) {
    return passwordExpiryEl.innerText;
  }
  return null;
}

/**
 * Checks if the specified username exists in a client's information.
 */
export function usernameInClientInfo(username: string, clientInfo: ClientInfo): boolean {
  return clientInfo.indexOf(username) > -1;
}

/**
 * Creates a WrongClient error.
 * @param clientInfo Currently logged in client's information.
 */
export function getWrongClientError(clientInfo: ClientInfo): LoginError {
  return new LoginError(`Still logged in as another client "${clientInfo}"`, 'WrongClient', {
    loggedInClient: clientInfo,
  });
}

/**
 * Checks to see if a client was logged in successfully.
 * @throws {LoginError}
 */
export function checkLogin(root: HTMLDocument | HTMLElement, client: Client) {
  // Detect login errors such as expired password, invalid username and invalid password
  const expiredPasswordErrorEl = <HTMLElement | null>(
    root.querySelector('#loginAdminForm>p.tablerowhead')
  );
  const errorEl = <HTMLElement | null>root.querySelector('.error');
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
        const errorData: { clientName: string; attemptsRemaining: number | null } = {
          clientName: client.username,
          attemptsRemaining: null,
        };

        // Add extra information about the error if it's available.
        // This is mainly used to show the number of attempts left.
        const loginErrorDetailsEl = <HTMLElement | null>(
          root.querySelector('#loginForm #layer1>table>tbody>tr.whitepapartdBig')
        );
        if (loginErrorDetailsEl) {
          const loginErrorDetails = loginErrorDetailsEl.innerText;
          if (loginErrorDetails) {
            // extract number of attempts
            const numAttemptsMatch = loginErrorDetails.toLowerCase().match(/you have (\d+) attempt\(s\) left/);
            if (numAttemptsMatch) {
              const numAttempts = Number(numAttemptsMatch[1]);
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
