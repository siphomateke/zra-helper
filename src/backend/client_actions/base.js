import store from '@/store';
import log from '@/transitional/log';
import createTask from '@/transitional/tasks';
import { taskStates } from '@/store/modules/tasks';
import { clickElement, createTab, executeScript, sendMessage, tabLoaded, closeTab } from '../utils';

/** @typedef {import('../constants').Client} Client */

/**
 * Creates a new tab, logs in and then closes the tab
 *
 * @param {Client} client
 * @param {number} parentTaskId
 * @returns {Promise}
 * @throws {import('./errors').ExtendedError}
 */
export async function login(client, parentTaskId) {
  const task = await createTask(store, {
    title: 'Login',
    parent: parentTaskId,
    progressMax: 7,
    status: 'Opening tab',
  });

  log.setCategory('login');
  log.log(`Logging in client "${client.name}"`);
  try {
    const tab = await createTab('https://www.zra.org.zm');
    task.addStep('Waiting for tab to load');
    try {
      await tabLoaded(tab.id);
      task.addStep('Navigating to login page');
      // Navigate to login page
      await clickElement(
        tab.id,
        '#leftMainDiv>tbody>tr:nth-child(2)>td>div>div>div:nth-child(2)>table>tbody>tr:nth-child(1)>td:nth-child(1)>ul>li>a',
        'go to login button',
      );
      task.addStep('Waiting for login page to load');
      await tabLoaded(tab.id);
      task.addStep('Logging in');
      // OCRAD should be imported in login.js but work with webpack
      await executeScript(tab.id, { file: 'ocrad.js' }, true);
      await executeScript(tab.id, { file: 'login.js' });
      // Actually login
      await sendMessage(tab.id, {
        command: 'login',
        client,
        maxCaptchaRefreshes: 10,
      });
      task.addStep('Waiting for login to complete');
      await tabLoaded(tab.id);
      task.addStep('Checking if login was successful');
      await executeScript(tab.id, { file: 'check_login.js' });
      await sendMessage(tab.id, {
        command: 'checkLogin',
        client,
      });
      task.state = taskStates.SUCCESS;
      task.status = '';
      log.log(`Done logging in "${client.name}"`);
    } finally {
      // Don't need to wait for the tab to close to carry out logged in actions
      // TODO: Catch tab close errors
      closeTab(tab.id);
    }
  } catch (error) {
    task.setError(error);
    throw error;
  } finally {
    task.markAsComplete();
  }
}

/**
 * Creates a new tab, logs out and then closes the tab
 *
 * @param {number} parentTaskId
 * @returns {Promise}
 */
export async function logout(parentTaskId) {
  const task = await createTask(store, {
    title: 'Logout',
    parent: parentTaskId,
    progressMax: 3,
    status: 'Opening tab',
  });

  log.setCategory('logout');
  log.log('Logging out');
  try {
    const tab = await createTab('https://www.zra.org.zm/main.htm?actionCode=showHomePageLnclick');
    try {
      task.addStep('Initiating logout');
      // Click logout button
      await clickElement(tab.id, '#headerContent>tbody>tr>td:nth-child(3)>a:nth-child(23)', 'logout button');
      task.addStep('Waiting to finish logging out');
      task.state = taskStates.SUCCESS;
      task.status = '';
      log.log('Done logging out');
    } finally {
      // Note: The tab automatically closes after pressing logout
      // TODO: Catch tab close errors
      closeTab(tab.id);
    }
  } catch (error) {
    task.setError(error);
    throw error;
  } finally {
    task.markAsComplete();
  }
}

/**
 * Logs in a client and retries if already logged in as another client
 * @param {Client} client
 * @param {number} parentTaskId
 * @param {number} [maxAttempts=3] The maximum number of times an attempt should be made to login to a client.
 */
export async function robustLogin(client, parentTaskId, maxAttempts = 3) {
  console.log(maxAttempts);
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
  try {
    while (run) {
      try {
        if (attempts > 0) {
          task.status = 'Logging in again';
        } else {
          task.status = 'Logging in';
        }
        await login(client, task.id);
        run = false;
      } catch (error) {
        if (error.type === 'LoginError' && error.code === 'WrongClient' && attempts + 1 < maxAttempts) {
          log.setCategory('login');
          log.showError(error, true);
          task.status = 'Logging out';
          await logout(task.id);
          run = true;
        } else {
          throw error;
        }
      }
      attempts++;
    }
    task.state = taskStates.SUCCESS;
    task.status = '';
  } catch (error) {
    task.setError(error);
    throw error;
  } finally {
    task.markAsComplete();
  }
}

/**
 * @typedef {Object} ClientActionFunctionParam
 * @property {Client} client
 * @property {import('@/transitional/tasks').TaskObject} parentTask
 * @property {import('@/transitional/output').default} output
 * @property {Object} clientActionConfig this client action's config
 */

/**
 * @callback ClientActionFunction
 * @param {ClientActionFunctionParam} param
 */

/**
 * @typedef ClientActionObject
 * @property {string} id A unique camelCase ID to identify this client action.
 * @property {string} name The human-readable name of this client action
 * @property {ClientActionFunction} [func]
 */
