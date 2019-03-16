import store from '@/store';
import log from '@/transitional/log';
import createTask from '@/transitional/tasks';
import {
  tabLoaded,
  closeTab,
  runContentScript,
  getDocumentByAjax,
  createTabPost,
} from '@/backend/utils';
import { taskFunction } from './utils';
import { getElementFromDocument, getHtmlFromNode } from '../content_scripts/helpers/elements';
import { CaptchaLoadError, LogoutError } from '@/backend/errors';
import OCRAD from 'ocrad.js';
import md5 from 'md5';

/**
 * Creates a canvas from a HTML image element
 * @param {HTMLImageElement} image The image to use
 * @param {number} [scale=1] Optional scale to apply to the image
 * @returns {HTMLCanvasElement}
 */
function imageToCanvas(image, scale = 1) {
  const width = image.width * scale;
  const height = image.height * scale;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, width, height);
  return canvas;
}

/**
 * Generates a new captcha as a canvas
 * @param {number} [scale=2] Optional scale to help recognize the image
 * @returns {Promise.<HTMLCanvasElement>}
 */
function getFreshCaptcha(scale = 2) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Set crossOrigin to 'anonymous' to fix the "operation is insecure" error in Firefox.
    // See https://stackoverflow.com/a/17035132/2999486.
    image.crossOrigin = 'anonymous';
    const src = `https://www.zra.org.zm/GenerateCaptchaServlet.do?sourcePage=LOGIN&t=${new Date().getTime()}`;
    image.src = src;
    image.onload = function onload() {
      resolve(imageToCanvas(image, scale));
    };
    image.onerror = function onerror() {
      reject(new CaptchaLoadError('Error loading captcha.', null, { src }));
    };
  });
}

/**
 * Solves a simple arithmetic captcha.
 *
 * The input text should be in the format: "<number> <operator> <number>?". For example, '112-11?'.
 * Spaces and question marks are automatically stripped.
 * @param {string} text Text containing arithmetic question.
 * @example
 * solveCaptcha('112- 11?') // 101
 * @returns {number}
 */
function solveCaptcha(text) {
  const captchaArithmetic = text.replace(/\s/g, '').replace(/\?/g, '');
  let numbers = captchaArithmetic.split(/\+|-/).map(str => parseInt(str, 10));
  numbers = numbers.map(number => Number(number)); // convert to actual numbers
  const operator = captchaArithmetic[captchaArithmetic.search(/\+|-/)];
  if (operator === '+') {
    return numbers[0] + numbers[1];
  }
  return numbers[0] - numbers[1];
}

/**
 * Common characters that the OCR engine incorrectly outputs and their
 * correct counterparts
 */
const commonIncorrectCharacters = [
  ['l', '1'],
  ['o', '0'],
];

/**
 * Gets and solves the login captcha.
 * @param {number} maxCaptchaRefreshes
 * The maximum number of times that a new captcha will be loaded if the OCR fails
 * @returns {Promise.<number>} The solution to the captcha.
 */
async function getCaptchaText(maxCaptchaRefreshes) {
  // Solve captcha
  let answer = null;
  let refreshes = 0;
  /* eslint-disable no-await-in-loop */
  while (refreshes < maxCaptchaRefreshes) {
    const captcha = await getFreshCaptcha();
    const captchaText = OCRAD(captcha);
    answer = solveCaptcha(captchaText);

    // If captcha reading failed, try again with common recognition errors fixed.
    let newText = '';
    if (Number.isNaN(answer)) {
      newText = captchaText;
      for (const error of commonIncorrectCharacters) {
        newText = newText.replace(new RegExp(error[0], 'g'), error[1]);
      }
      answer = solveCaptcha(newText);
    }

    // If captcha reading still failed, try again with a new one.
    if (Number.isNaN(answer)) {
      refreshes++;
    } else {
      break;
    }
  }
  /* eslint-enable no-await-in-loop */
  return answer;
}

/** @typedef {import('@/backend/constants').Client} Client */

/**
 * Creates a new tab, logs in and then closes the tab
 * @param {Object} payload
 * @param {Client} payload.client
 * @param {number} payload.parentTaskId
 * @param {boolean} [payload.keepTabOpen]
 * Whether the logged in tab should be kept open after logging in.
 * @returns {Promise.<number>} The ID of the logged in tab.
 * @throws {import('@/backend/errors').ExtendedError}
 */
export async function login({ client, parentTaskId, keepTabOpen = false }) {
  const task = await createTask(store, {
    title: 'Login',
    parent: parentTaskId,
    progressMax: 4,
    status: 'Getting session hash',
  });

  log.setCategory('login');
  log.log(`Logging in client "${client.name}"`);
  let tabId = null;

  return taskFunction({
    task,
    async func() {
      // Retrieve login page to get hidden 'pwd' field's value.
      const doc = await getDocumentByAjax({
        url: 'https://www.zra.org.zm/login.htm?actionCode=newLogin',
        data: { flag: 'TAXPAYER' },
      });
      const pwd = getElementFromDocument(doc, '#loginForm>[name="pwd"]', 'secret pwd input').value;

      task.addStep('Initiate login');
      try {
        const loginRequest = {
          actionCode: 'loginUser',
          flag: 'TAXPAYER',
          userName: client.username,
          pwd: md5(pwd),
          xxZTT9p2wQ: md5(client.password),
          // Note: the ZRA website misspelled captcha
          captcahText: await getCaptchaText(10),
        };
        const tab = await createTabPost({
          url: 'https://www.zra.org.zm/login.htm',
          data: loginRequest,
        });
        tabId = tab.id;
        task.addStep('Waiting for login to complete');
        try {
          await tabLoaded(tabId);
          task.addStep('Checking if login was successful');
          await runContentScript(tabId, 'check_login', { client });
          log.log(`Done logging in "${client.name}"`);
          return tabId;
        } finally {
          if (!keepTabOpen) {
            // Don't need to wait for the tab to close to carry out logged in actions
            // TODO: Catch tab close errors
            closeTab(tabId);
          }
        }
      } catch (error) {
        /*
        If login doesn't get to the end, the tab ID will never be returned.
        Thus, nothing else will be able to close the login tab and it must be closed
        here instead.

        We may want to make it possible to return the tab ID even if an error occurs in the future,
        however, this is not necessary at the moment since nothing else can run if logging in
        fails.
        */
        if (keepTabOpen && tabId !== null) {
          // TODO: Catch tab close errors
          closeTab(tabId);
        }
        throw error;
      }
    },
  });
}

/**
 * Creates a new tab, logs out and then closes the tab
 * @param {Object} payload
 * @param {number} payload.parentTaskId
 * @returns {Promise}
 */
export async function logout({ parentTaskId }) {
  const task = await createTask(store, {
    title: 'Logout',
    parent: parentTaskId,
    indeterminate: true,
  });

  log.setCategory('logout');
  log.log('Logging out');
  return taskFunction({
    task,
    async func() {
      const doc = await getDocumentByAjax({
        url: 'https://www.zra.org.zm/login.htm?actionCode=logOutUser',
        method: 'post',
        data: { userType: 'TAXPAYER' },
      });
      // TODO: Somehow convert the element not found errors thrown here to logout errors.
      const el = getElementFromDocument(
        doc,
        'body>table>tbody>tr>td>table>tbody>tr>td>form>table>tbody>tr:nth-child(1)>td',
        'logout message',
      );
      const logoutMessage = el.innerText.toLowerCase();
      if (!logoutMessage.includes('you have successfully logged off')) {
        throw new LogoutError('Logout success message was empty.', null, { html: getHtmlFromNode(doc) });
      }
      log.log('Done logging out');
    },
  });
}

/**
 * Logs in a client and retries if already logged in as another client
 * @param {Object} payload
 * @param {Client} payload.client
 * @param {number} payload.parentTaskId
 * @param {number} payload.maxAttempts
 * The maximum number of times an attempt should be made to login to a client.
 * @param {boolean} [payload.keepTabOpen] Whether the logged in tab should be kept open.
 * @returns {Promise.<number>} The ID of the logged in tab.
 */
export async function robustLogin({
  client, parentTaskId, maxAttempts, keepTabOpen = false,
}) {
  const task = await createTask(store, {
    title: 'Robust login',
    parent: parentTaskId,
    unknownMaxProgress: false,
    // After every login attempt except the last one, we logout.
    // So if the maximum number of login attempts is 3, we login 3 times but only logout 2 times.
    // Thus the total number of tasks would be 3 + (3-1) = 5
    progressMax: maxAttempts + (maxAttempts - 1),
  });
  let attempts = 0;
  let run = true;
  return taskFunction({
    task,
    async func() {
      let loggedInTabId = null;
      /* eslint-disable no-await-in-loop */
      while (run) {
        try {
          if (attempts > 0) {
            task.status = 'Logging in again';
          } else {
            task.status = 'Logging in';
          }
          loggedInTabId = await login({ client, parentTaskId: task.id, keepTabOpen });
          run = false;
        } catch (error) {
          if (error.type === 'LoginError' && error.code === 'WrongClient' && attempts + 1 < maxAttempts) {
            log.setCategory('login');
            log.showError(error, true);
            task.status = 'Logging out';
            await logout({ parentTaskId: task.id });
            run = true;
          } else {
            throw error;
          }
        }
        attempts++;
      }
      /* eslint-enable no-await-in-loop */
      return loggedInTabId;
    },
  });
}
