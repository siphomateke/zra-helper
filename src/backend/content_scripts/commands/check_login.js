import { LoginError } from '@/backend/errors';
import {
  getWrongClientError,
  getClientInfo,
  usernameInClientInfo,
} from '@/backend/content_scripts/helpers/check_login';
import { getElementText, getHtmlFromNode } from '@/backend/content_scripts/helpers/elements';
import addContentScriptListener from '@/backend/content_scripts/helpers/listener';

/**
 * @param {Object} message
 * @param {import('@/backend/constants').Client} message.client
 */
async function listener(message) {
  // Detect login errors such as expired password, invalid username and invalid password
  const expiredPasswordErrorEl = document.querySelector('#loginAdminForm>p.tablerowhead');
  const errorEl = document.querySelector('.error');
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
          clientName: message.client.username,
        });
      } else if (lowerCaseErrorString.includes('invalid login id or password')) {
        let errorMessage = 'Invalid login ID or password';
        const errorData = {
          clientName: message.client.username,
        };

        // Add extra information about the error if it's available.
        // This is mainly used to show the number of attempts left.
        const loginErrorDetailsEl = document.querySelector('#loginForm #layer1>table>tbody>tr.whitepapartdBig');
        if (loginErrorDetailsEl) {
          const loginErrorDetails = loginErrorDetailsEl.innerText.toLowerCase();
          if (loginErrorDetails) {
            // extract number of attempts
            const numAttemptsMatch = loginErrorDetails.match(/you have (\d+) attempt\(s\) left/);
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
          clientName: message.client.username,
        });
      }
      throw error;
    }
  }

  const clientInfo = getClientInfo();
  if (clientInfo) {
    const foundUsername = usernameInClientInfo(message.client.username, clientInfo);
    // If we did not find the username in the client info, then another client
    // is already logged in.
    if (foundUsername) {
      return;
    }
    throw getWrongClientError(clientInfo);
  }
  // TODO: log no client info error

  throw new LoginError('Unknown error logging in', null, {
    clientName: message.client.username,
    documentString: getHtmlFromNode(document),
  });
}
addContentScriptListener('check_login', listener);
