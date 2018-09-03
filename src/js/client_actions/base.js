import $ from 'jquery';
import { log } from '../log';
import { Task, taskStates } from '../tasks';
import {
  clickElement, createTab, executeScript, sendMessage, tabLoaded,
} from '../utils';

/** @typedef {import('../constants').Client} Client */

export class Output {
  constructor() {
    // TODO: Support multiple outputs
    this.el = $('#output');
  }

  set value(value) {
    this.el.val(value);
  }

  get value() {
    return this.el.val();
  }

  addRow(row) {
    this.value = `${this.value}${row}\n`;
  }

  clear() {
    this.value = '';
  }
}

/**
 * Creates a new tab, logs in and then closes the tab
 *
 * @param {Client} client
 * @param {Task} parentTask
 * @returns {Promise}
 * @throws {import('./errors').ExtendedError}
 */
async function login(client, parentTask) {
  const task = new Task('Login', parentTask.id);
  task.progressMax = 7;
  task.status = 'Opening tab';

  log.setCategory('login');
  log.log(`Logging in client "${client.name}"`);
  try {
    const tab = await createTab('https://www.zra.org.zm');
    task.addStep('Waiting for tab to load');
    try {
      await tabLoaded(tab.id);
      task.addStep('Navigating to login page');
      // Navigate to login page
      await clickElement(tab.id, '#leftMainDiv>tbody>tr:nth-child(2)>td>div>div>div:nth-child(2)>table>tbody>tr:nth-child(1)>td:nth-child(1)>ul>li>a', 'go to login button');
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
      browser.tabs.remove(tab.id);
    }
  } catch (error) {
    task.setError(error);
    throw error;
  } finally {
    task.complete = true;
  }
}

/**
 * Creates a new tab, logs out and then closes the tab
 *
 * @param {Task} parentTask
 * @returns {Promise}
 */
async function logout(parentTask) {
  const task = new Task('Logout', parentTask.id);
  task.progressMax = 3;
  task.status = 'Opening tab';

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
      browser.tabs.remove(tab.id);
    }
  } catch (error) {
    task.setError(error);
    throw error;
  } finally {
    task.complete = true;
  }
}

export class ClientAction {
  constructor(taskName, id, action) {
    this.mainTask = null;
    this.taskName = taskName;
    this.id = id;
    this.logCategory = id;
    this.action = action;

    this.output = new Output();

    const field = $(`<div class="control"><label class="checkbox"><input type="checkbox" name="actions" value="${id}"> ${taskName}</label></div>`);
    $('#actions-field').append(field);
  }

  /**
     * Logs in a client and retries if already logged in as another client
     * @param {Client} client
     * @param {Task} parentTask
     * @param {number} [maxAttempts=2]
     */
  async robustLogin(client, parentTask, maxAttempts = 2) {
    const task = new Task('Robust login', parentTask.id);
    task.progress = -2;
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
          await login(client, task);
          run = false;
        } catch (error) {
          if (error.type === 'LoginError' && error.code === 'WrongClient' && attempts < maxAttempts) {
            log.setCategory('login');
            log.showError(error, true);
            task.status = 'Logging out';
            await logout(task);
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
      task.complete = true;
    }
  }

  async run(client) {
    this.mainTask = new Task(`${client.name}: ${this.taskName}`);
    try {
      this.mainTask.status = 'Logging in';
      await this.robustLogin(client, this.mainTask);

      this.mainTask.status = this.taskName;
      const task = new Task(this.taskName, this.mainTask.id);
      log.setCategory(this.id);
      await this.action(client, task, this.output);
      if (task.state === taskStates.ERROR) {
        this.mainTask.state = taskStates.ERROR;
      }

      this.mainTask.status = 'Logging out';
      await logout(this.mainTask);

      if (this.mainTask.state !== taskStates.ERROR) {
        if (this.mainTask.childStateCounts[taskStates.WARNING] > 0) {
          this.mainTask.state = taskStates.WARNING;
        } else {
          this.mainTask.state = taskStates.SUCCESS;
        }
      }
      this.mainTask.status = '';
    } catch (error) {
      log.setCategory(this.logCategory);
      log.showError(error);
      this.mainTask.setError(error);
    } finally {
      this.mainTask.complete = true;
    }
  }
}

/**
 * Runs a client action on all the clients
 *
 * @param {Client[]} clientList
 * @param {ClientAction} action
 */
export async function allClientsAction(clientList, action) {
  if (clientList.length > 0) {
    for (let i = 0; i < clientList.length; i++) {
      const client = clientList[i];
      // TODO: Consider checking if a tab has been closed prematurely all the time.
      // Currently, only tabLoaded checks for this.
      await action.run(client);
    }
  } else {
    log.setCategory('client_action');
    log.showError('No clients found');
  }
}
