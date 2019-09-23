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
import { checkLogin } from '../content_scripts/helpers/check_login';
import { TaskState, TaskId } from '@/store/modules/tasks';
import { Client, ZraDomain } from '../constants';
import { RequiredBy } from '@/utils';

/**
 * Creates a canvas from a HTML image element
 * @param image The image to use
 * @param scale Optional scale to apply to the image
 */
function imageToCanvas(image: HTMLImageElement, scale: number = 1): HTMLCanvasElement {
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
 * @param scale Optional scale to help recognize the image
 */
function getFreshCaptcha(scale: number = 2): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Set crossOrigin to 'anonymous' to fix the "operation is insecure" error in Firefox.
    // See https://stackoverflow.com/a/17035132/2999486.
    image.crossOrigin = 'anonymous';
    const src = `${ZraDomain}/GenerateCaptchaServlet.do?sourcePage=LOGIN&t=${new Date().getTime()}`;
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
 * @param text Text containing arithmetic question.
 * @example
 * solveCaptcha('112- 11?') // 101
 */
function solveCaptcha(text: string): number {
  const captchaArithmetic = text.replace(/\s/g, '').replace(/\?/g, '');
  let numbers = captchaArithmetic.split(/\+|-/).map(str => parseInt(str, 10));
  // TODO: Find out why we are converting to a number twice.
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
const commonIncorrectCharacters = [['l', '1'], ['o', '0']];

/**
 * Gets and solves the login captcha.
 * @param maxCaptchaRefreshes
 * The maximum number of times that a new captcha will be loaded if the OCR fails
 * @returns The solution to the captcha.
 */
async function getCaptchaText(maxCaptchaRefreshes: number): Promise<number | null> {
  // Solve captcha
  let answer: number | null = null;
  let refreshes = 0;
  /* eslint-disable no-await-in-loop */
  while (refreshes < maxCaptchaRefreshes) {
    const captcha = await getFreshCaptcha();
    const captchaText: string = OCRAD(captcha);
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

interface LoginFnOptions<KeepTabOpen extends boolean> {
  client: Client;
  parentTaskId: TaskId;
  /** Whether the logged in tab should be kept open after logging in. */
  keepTabOpen?: KeepTabOpen;
  /**
   * Whether to close the tab if any errors occurred when checking if the client was successfully
   * logged in. Only used when `keepTabOpen` is true.
   */
  closeOnErrors?: boolean;
}

interface LoginResponse<TabId extends number | null> {
  /** The ID of the logged in tab. */
  tabId: TabId;
  /** Any error that occurred checking if the client was successfully logged in. */
  checkLoginError?: any;
}

export async function login<T extends boolean>(options: RequiredBy<LoginFnOptions<T>, 'keepTabOpen'>): Promise<LoginResponse<T extends true ? number : null>>;
export async function login(options: LoginFnOptions<any>): Promise<LoginResponse<null>>;
/**
 * Creates a new tab, logs in and then closes the tab
 * @throws {import('@/backend/errors').ExtendedError}
 */
export async function login({
  client,
  parentTaskId,
  keepTabOpen = false,
  closeOnErrors = true,
}: LoginFnOptions<boolean>): Promise<LoginResponse<number | null>> {
  const task = await createTask(store, {
    title: 'Login',
    parent: parentTaskId,
    unknownMaxProgress: false,
    progressMax: 4,
    status: 'Getting session hash',
  });

  log.setCategory('login');
  log.log(`Logging in client "${client.name}"`);

  return taskFunction({
    task,
    setState: false,
    async func() {
      // Retrieve login page to get hidden 'pwd' field's value.
      const doc = await getDocumentByAjax({
        url: `${ZraDomain}/login.htm?actionCode=newLogin`,
        data: { flag: 'TAXPAYER' },
      });
      const pwd = (<HTMLInputElement>getElementFromDocument(doc, '#loginForm>[name="pwd"]', 'secret pwd input')).value;

      let tabId: number | null = null;
      task.addStep('Initiating login');
      try {
        const loginRequest = {
          url: `${ZraDomain}/login.htm`,
          data: {
            actionCode: 'loginUser',
            flag: 'TAXPAYER',
            userName: client.username,
            pwd: md5(pwd),
            xxZTT9p2wQ: md5(client.password),
            // Note: the ZRA website misspelled captcha
            captcahText: await getCaptchaText(10),
          },
        };

        task.addStep('Waiting for login to complete');
        let doc = null;
        if (keepTabOpen) {
          const tab = await createTabPost(loginRequest);
          tabId = tab.id;
          await tabLoaded(tabId);
        } else {
          doc = await getDocumentByAjax(Object.assign({ method: 'post' }, loginRequest));
        }

        let checkLoginError;
        try {
          task.addStep('Checking if login was successful');
          if (keepTabOpen) {
            await runContentScript(tabId, 'check_login', { client });
          } else {
            checkLogin(doc, client);
          }
          log.log(`Done logging in "${client.name}"`);
          task.state = TaskState.SUCCESS;
        } catch (error) {
          task.setError(error);
          checkLoginError = error;
          // By default, close the tab if logging in failed. This can be disabled by setting
          // `closeOnErrors` to false.
          if (keepTabOpen && closeOnErrors && tabId !== null) {
            // TODO: Catch tab close errors
            closeTab(tabId);
          }
        }

        return {
          tabId,
          checkLoginError,
        };
      } catch (error) {
        /*
        If opening the login tab failed, the tab ID will never be returned.
        Thus, nothing else will be able to close the login tab and it must be closed
        here instead.

        We may want to make it possible to return the tab ID even if an error occurs in the future,
        however, this is not necessary at the moment since the tab is useless if it didn't load.
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

interface LogoutFnOptions {
  parentTaskId: TaskId;
}

/**
 * Creates a new tab, logs out and then closes the tab
 */
export async function logout({ parentTaskId }: LogoutFnOptions): Promise<void> {
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
        url: `${ZraDomain}/login.htm?actionCode=logOutUser`,
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
        throw new LogoutError('Logout success message was empty.', null, {
          html: getHtmlFromNode(doc),
        });
      }
      log.log('Done logging out');
    },
  });
}

interface RobustLoginFnOptions<KeepTabOpen extends boolean> extends LoginFnOptions<KeepTabOpen> {
  /** The maximum number of times an attempt should be made to login to a client. */
  maxAttempts: number;
  /**
   * Whether to close the tab if any errors occur when checking if the client was successfully logged
   * in. Only used when `keepTabOpen` is true. If more than one login attempt is made, only the tab
   * from the last attempt will be kept open on errors.
   */
  closeOnErrors?: boolean;
}

export async function robustLogin<T extends boolean>(options: RequiredBy<RobustLoginFnOptions<T>, 'keepTabOpen'>): Promise<T extends true ? number : null>;
export async function robustLogin(options: RobustLoginFnOptions<any>): Promise<null>;
/**
 * Logs in a client and retries if already logged in as another client
 * @returns The ID of the logged in tab.
 */
export async function robustLogin({
  client,
  parentTaskId,
  maxAttempts,
  keepTabOpen = false,
  closeOnErrors = true,
}: RobustLoginFnOptions<boolean>): Promise<number | null> {
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
      let loggedInTabId: number | null = null;
      /* eslint-disable no-await-in-loop */
      while (run) {
        try {
          if (attempts > 0) {
            task.status = 'Logging in again';
          } else {
            task.status = 'Logging in';
          }
          const response = await login({
            client,
            parentTaskId: task.id,
            keepTabOpen,
            closeOnErrors,
          });
          loggedInTabId = response.tabId;
          if (typeof response.checkLoginError !== 'undefined') {
            throw response.checkLoginError;
          }
          run = false;
        } catch (error) {
          if (error.type === 'LoginError' && error.code === 'WrongClient' && attempts + 1 < maxAttempts) {
            // Even if `closeOnErrors` is false, close the tab as we are about to make another.
            if (loggedInTabId !== null) {
              closeTab(loggedInTabId);
            }
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
