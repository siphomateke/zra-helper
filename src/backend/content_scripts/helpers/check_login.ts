import { LoginError } from '../../errors';
import { getHtmlFromNode, getElementText, getElementFromDocument } from './elements';
import { Client } from '@/backend/constants';

/**
 * Client's username. E.g. "1000000000". This is vaguely called "client info" in case ZRA changes
 * again and includes more information in the username field.
 */
type ClientInfo = string;

/**
 * Gets the currently logged in client's information.
 * @throws {ElementNotFoundError}
 */
export function getClientInfo(root: HTMLDocument | HTMLElement): ClientInfo {
  // ZRA returns a different tax payer detail's table wrapper depending on the type of client.
  const wrapper = getElementFromDocument(root, '#otherTaxpayerDetails,#partnershipTaxpayerDetails', 'tax payer details table wrapper');
  const clientEl = getElementFromDocument(wrapper, 'div:nth-child(2)>div:nth-child(1)>table:nth-child(1)>tbody:nth-child(1)>tr:nth-child(1)>td:nth-child(2)', 'tax payer details table TPIN');
  return clientEl.innerText;
}

/**
 * Gets the date when a client's password will expire.
 */
export function getPasswordExpiryDate(root: HTMLDocument | HTMLElement) {
  const passwordExpiryEl = <HTMLElement | null>(
    // FIXME: Update for ZRA v2
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
    root.querySelector('.auth-box>.alert')
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
      } else if (lowerCaseErrorString.includes('invalid username or password or captcha')) {
        let errorMessage = 'Invalid username or password or captcha';
        const errorData: { clientName: string; attemptsRemaining: number | null } = {
          clientName: client.username,
          attemptsRemaining: null,
        };

        // Add extra information about the error if it's available.
        // This is mainly used to show the number of attempts left.
        const loginErrorDetailsEl = <HTMLElement | null>(
          // TODO: Update
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

  let clientInfo;
  try {
    clientInfo = getClientInfo(root);
  } catch (error) {
    throw new LoginError('Error finding element to verify if login was successful', 'VerificationFailed', {
      clientName: client.username,
      documentString: getHtmlFromNode(root),
      verificationError: error,
    });
  }

  const foundUsername = usernameInClientInfo(client.username, clientInfo);
  // If we did not find the username in the client info, then another client
  // is already logged in.
  if (foundUsername) {
    return;
  }
  throw getWrongClientError(clientInfo);
}
