const debug = false;

const taxTypes = {
    '01': 'ITX',
    '02': 'VAT',
    '03': 'PAYE',
    '05': 'TOT',
    '06': 'WHT',
    '07': 'PTT',
    '08': 'MINROY',
    '09': 'TLEVY',
};

/**
 * @typedef Client
 * @property {string} name
 * @property {string} username
 * @property {string} password
 */

/** @type {Client[]} */
let clientList = [];

/**
 * Executes a script in a particular tab. A browser polyfill is added by default
 * 
 * @param {nubmer} tabId 
 * @param {browser.extensionTypes.InjectDetails} details 
 * @param {boolean} addPolyfill Whether or not a browser polyfill should be added
 * 
 * @return {Promise}
 */
async function executeScript(tabId, details, addPolyfill=true) {
    if (addPolyfill) {
        await browser.tabs.executeScript(tabId, {file: 'vendor/browser-polyfill.min.js'});
    }
    await browser.tabs.executeScript(tabId, details);
}

/**
 * Waits for a tab to load
 * @param {number} desiredTabId 
 * @return {Promise}
 * 
 * @throws Throws an error if the tab is closed before it loads
 */
function tabLoaded(desiredTabId) {
	return new Promise((resolve, reject) => {
		function listener(tabId, changeInfo) {
            // TODO: Handle no internet
			if (tabId === desiredTabId && changeInfo.status === 'complete') {
                browser.tabs.onUpdated.removeListener(listener);
                browser.tabs.onRemoved.removeListener(closeListener);
				resolve();
			}
		}
        function closeListener(tabId) {
            if (tabId === desiredTabId) {
                browser.tabs.onRemoved.removeListener(closeListener);
                reject(new Error('tab_closed_prematurely'));
            }
        }
		browser.tabs.onUpdated.addListener(listener);
        browser.tabs.onRemoved.addListener(closeListener);
	});
}

/*const tabLoadObjects = [];

function tabLoaded(desiredTabId) {
	return new Promise((resolve) => {
		tabLoadObjects.push({
			id: desiredTabId,
			callback: resolve,
		});
	});
}

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
	for (const tabLoadObject of tabLoadObjects) {
		if (tabId === tabLoadObject.id && changeInfo.status === 'complete') {
			tabLoadObject.callback();
			// delete it from array
		}
	}
});*/

/**
 *
 * @return {browser.tabs.Tab}
 */
async function getActiveTab() {
	const tabs = await browser.tabs.query({active: true, currentWindow: true});
	if (tabs.length > 0) {
		return tabs[0];
	} else {
		return null;
	}
}

function waitForMessage(validator) {
	return new Promise(async (resolve) => {
		function listener(message) {
			if (validator(message)) {
				browser.runtime.onMessage.addListener.removeListener(listener);
				resolve(message);
			}
		}
		browser.runtime.onMessage.addListener(listener);
	});
}

class IO {
    constructor() {
        this.logLines = [];
        this.logWrapperEl = $('#log-wrapper');
        this.logElement = $('#log');

        this.outputElement = $('#output');

        this.errors = [];

        this.progressElement = $('#progress');
        this.progress = -2;
    }
    setCategory(category) {
        this.category = category;
    }
    log(value, type) {
        this.logLines.push(value);
        if (this.logLines.length > 0) {
            this.logWrapperEl.removeClass('hidden');
        }
        const now = new Date(Date.now());
        let timestamp = now.getDate()+'/'+now.getMonth()+'/'+now.getFullYear();
        timestamp += ' '+now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()+':'+now.getMilliseconds();
        let text = '['+timestamp+'] '+this.category+': '+value+'<br>'
        if (type === 'error') {
            text = '<span class="error">'+text+'</span>';
        }
        this.logElement.append(text);
    }
    clearLog() {
        this.logElement.text('');
    }
    showError(error) {
        this.errors.push(error);
        this.log('[Error] '+error, 'error');
    }
    output(row) {
        this.outputElement.val(this.outputElement.val() + row+'\n');
    }
    clearOutput() {
        this.outputElement.val('');
    }
    refreshProgress() {
        if (this.progress !== -2) {
            this.progressElement.removeClass('hidden');
        }
        if (this.progress === -1) {
            this.progressElement.removeAttr('value');
        } else {
            this.progressElement.val(this.progress);
        }
    }
    setProgress(progress)  {
        this.progress = progress;
        this.refreshProgress();
    }
    addProgress(toAdd) {
        this.progress += toAdd;
        this.refreshProgress();
    }
    setProgressMax(max) {
        this.progressMax = max;
        this.progressElement.attr('max', this.progressMax);
    }
}

/** @type {Object.<string, Task>} */
const tasks = {};
let lastTaskId = 0;

class Task {
    constructor(title, parentId=null) {
        this.title = title;
        this.parentId = parentId;
        this.hasParent = this.parentId !== null;
        this.parent = (this.hasParent) ? tasks[this.parentId] : null;
        this.children = [];
        this._status = '';

        this._progress = -2;
        this._progressMax = 100;
        /** Whether this task's state affects its parent's state */
        this.broadcastState = true;
        /** Whether this task will automatically update it's parent progress and status */
        this.autoUpdateParent = true;

        this._complete = false;
        // TODO: Use an enum for states
        this._state = '';

        /** HTML Elements */
        this.els = {
            root: $(`<div class="task"></div>`),
            content: $('<div class="content"></div>'),
            title: $(`<div class="title">${this.title}</div>`),
            status: $('<div class="status"></div>'),
            progress: $(`<progress value="${this._progress}" max="${this._progressMax}"></progress>`),
            // TODO: Improve details button
            detailsButton: $('<button type="button" class="open-details"><i class="fa fa-caret-right closed-icon"></i><i class="fa fa-caret-down open-icon"></i>Details</button>'),
        };

        if (this.hasParent) {
            /* this.els.root.removeClass('task'); */
            this.els.root.addClass('sub-task');
            const parentEl = this.parent.els.root;
            let subTasks = parentEl.find('.sub-tasks');
            if (!subTasks.length) {
                subTasks = $('<div class="sub-tasks"></div>')
                parentEl.append(subTasks);
            }

            subTasks.append(this.els.root);
            this.parent.els.detailsButton.show();
        } else {
            $('.tasks').append(this.els.root);
        }

        this.els.content.append(this.els.title);
        this.els.content.append(this.els.progress);
        this.els.content.append(this.els.status);
        if (!this.hasParent) {
            this.els.content.append(this.els.detailsButton);
            this.els.detailsButton.hide();
        }

        this.els.root.append(this.els.content);

        this.status = this._status;
        this.id = lastTaskId;
        tasks[this.id] = this;
        if (this.hasParent) {
            this.parent.addChild(this.id);
        }
        lastTaskId++;
    }
    get status() {
        return this._status;
    }
    set status(status) {
        this._status = status;
        if (this._status) {
            this.els.status.show();
        } else {
            this.els.status.hide();
        }
        this.els.status.text(this._status);
    }
    refreshProgress() {
        if (this._progress !== -2) {
            this.els.progress.removeClass('hidden');
        }
        if (this._progress === -1) {
            this.els.progress.removeAttr('value');
        } else {
            this.els.progress.val(this._progress);
        }
    }
    get progress() {
        return this._progress;
    }
    set progress(progress)  {
        this._progress = progress;
        this.refreshProgress();

        if (this.autoUpdateParent && this.hasParent) {
            this.parent.refresh();
        }
    }
    get progressMax() {
        return this._progressMax;
    }
    set progressMax(max) {
        this._progressMax = max;
        this.els.progress.attr('max', this._progressMax);
    }
    refresh() {
        this.progress = 0;
        this.progressMax = 0;
        let complete = true;
        let errors = false;
        for (const taskId of this.children) {
            const task = tasks[taskId];
            this.progress += task.progress;
            this.progressMax += task.progressMax;
            if (task.broadcastState && task.state === 'error') {
                errors = true;
            }
            if (!task.complete) {
                complete = false;
            }
        }
        if (errors) {
            this.state = 'error';
        } else {
            if (complete) {
                this.state = 'success';
            } else {
                this.state = '';
            }
        }
        this.complete = complete;
    }
    get complete() {
        return this._complete;
    }
    set complete(complete) {
        this._complete = complete;
        if (this._complete) {
            this.status = '';
            this.progress = this.progressMax;
            this.els.root.addClass('complete');
        } else {
            this.els.root.removeClass('complete');
        }
    }
    get state() {
        return this._state;
    }
    set state(state) {
        this._state = state;
        this.els.root.removeClass('error');
        this.els.root.removeClass('success');
        if (this._state) {
            this.els.root.addClass(this._state);
        }

        if (this.autoUpdateParent && this.hasParent) {
            this.parent.refresh();
        }
    }
    addChild(id) {
        this.children.push(id);
    }
    /**
     * Increments progress and sets status
     * @param {string} status 
     */
    addStep(status) {
        this.progress++;
        this.status = status;
    }
}

const io = new IO();

/**
 * Creates a new tab, logs in and then closes the tab
 * @async
 * @param {Client} client 
 * @param {Task} parentTask
 */
async function login(client, parentTask) {
    const task = new Task('Login', parentTask.id);
    task.progress = 0;
    task.progressMax = 7;
    task.status = 'Opening tab';
    
    io.setCategory('login');
    io.log(`Login client "${client.name}"`);
    try {
        const tab = await browser.tabs.create({url: 'https://www.zra.org.zm', active: false});
        task.addStep('Waiting for tab to load');
        try {
            await tabLoaded(tab.id);
            task.addStep('Navigating to login page');
            // Navigate to login page
            await executeScript(tab.id, {code: 'document.querySelector("#leftMainDiv>tbody>tr:nth-child(2)>td>div>div>div:nth-child(2)>table>tbody>tr:nth-child(1)>td:nth-child(1)>ul>li>a").click()'}, false);
            task.addStep('Waiting for login page to load');
            await tabLoaded(tab.id);
            task.addStep('Logging in');
            
            await executeScript(tab.id, {file: 'vendor/ocrad.js'});
            await executeScript(tab.id, {file: 'content_scripts/login.js'});
            // Actually login
            await browser.tabs.sendMessage(tab.id, {
                command: 'login',
                client,
            });
            task.addStep('Waiting for login to complete');
            await tabLoaded(tab.id);
            task.addStep('Checking if login was successful');
            await executeScript(tab.id, {file: 'content_scripts/check_login.js'});
            const response = await browser.tabs.sendMessage(tab.id, {
                command: 'checkLogin',
                client,
            });
            if (response.error) {
                throw new Error(response.error);
            }
            task.complete = true;
            task.state = 'success';
            io.log(`Done logging in "${client.name}"`);
        } finally {
            // Don't need to wait for the tab to close to carry out logged in actions
            // TODO: Catch tab close errors
            browser.tabs.remove(tab.id);
        }
    } catch (error) {
        task.complete = true;
        task.state = 'error';
        task.status = error.message;
        throw error;
    }
}

/**
 * Creates a new tab, logs out and then closes the tab
 * @param {Client} client
 * @param {Task} parentTask
 * @async
 */
async function logout(client, parentTask) {
    const task = new Task('Logout', parentTask.id);
    task.progress = 0;
    task.progressMax = 3;
    task.status = 'Opening tab';

    io.setCategory('logout');
    io.log(`Logging out "${client.name}"`);
    try {
        const tab = await browser.tabs.create({url: 'https://www.zra.org.zm/main.htm?actionCode=showHomePageLnclick', active: false});
        try {
            task.addStep('Initiating logout');
            await executeScript(tab.id, {code: 'document.querySelector("#headerContent>tbody>tr>td:nth-child(3)>a:nth-child(23)").click()'}, false);
            task.addStep('Waiting to finish logging out');
            task.complete = true;
            task.state = 'success';
            io.log(`Done logging out "${client.name}"`);
        } finally {
            // Note: The tab automatically closes after pressing logout
            // TODO: Catch tab close errors
            browser.tabs.remove(tab.id);
        }
    } catch (error) {
        task.complete = true;
        task.state = 'error';
        task.status = error.message;
        throw error;
    }
}

class ClientAction {
    constructor(taskName, action) {
        this.mainTask = null;
        this.taskName = taskName;
        this.action = action;
    }

    async run(client) {
        this.mainTask = new Task(client.name+': '+this.taskName);
        this.mainTask.progress = -1;
        try {
            // TODO: Treat each of the following statuses as different actions with separate progresses.
            // Keep in mind that each task may updates it's parent's progress.
            validateClient(client);
            this.mainTask.status = 'Logging in';
            await login(client, this.mainTask);
            this.mainTask.status = this.taskName;
            await this.action(client, this.mainTask);
            this.mainTask.status = 'Logging out';
            await logout(client, this.mainTask);
        } catch (error) {
            if (debug) {
                console.error(error);
            }
            let errorString = error.message;
            if (error.message === 'client_invalid') {
                errorString = `Row number ${i} is not a valid client`;
            }
            io.setCategory('client_action');
            // TODO: Consider checking if a tab has been closed prematurely all the time.
            // Currently, only tabLoaded checks for this.
            io.showError(errorString);
        } finally {
            this.mainTask.complete = true;
        }
    }
}

const getAllPendingLiabilitiesAction = new ClientAction('Get all pending liabilities', 
    /**
     * @param {Client} client
     * @param {Task} mainTask
     */
    (client, mainTask) => {
    return new Promise((resolve) => {
        let promises = [];
        /** Total number of pending liabilities including the grand total */
        const numTotals = 4;
        const totals = {};
        io.setCategory('pending_liabilities');
        for (const taxTypeId of Object.keys(taxTypes)) {
            promises.push(new Promise(async (resolve, reject) => {
                const taxType = taxTypes[taxTypeId];
                const task = new Task(`Get ${taxType} totals`, mainTask.id);
                task.progress = 0;
                task.progressMax = 4;
                // Failing to retrieve a tax type is not really an error so don't tell our parent task
                task.broadcastState = false;
                task.status = 'Opening tab';

                io.log(`Generating ${taxType} report`);

                let tab = null;
                try {
                    tab = await browser.tabs.create({
                        url: 'https://www.zra.org.zm/reportController.htm?actionCode=pendingLiability',
                        active: false,
                    });
                    await tabLoaded(tab.id);

                    task.addStep('Selecting tax type');

                    await executeScript(tab.id, {file: 'content_scripts/generate_report.js'});

                    try {
                        task.addStep('Generating report');

                        const response = await browser.tabs.sendMessage(tab.id, {
                            command: 'generateReport',
                            taxTypeId: taxTypeId
                        });
                        if (response.error) {
                            throw new Error(response.error);
                        }
                        // Get Totals
                        await tabLoaded(tab.id);

                        task.addStep('Getting totals');

                        await executeScript(tab.id, {file: 'content_scripts/get_totals.js'});
                        const totalsResponse = await browser.tabs.sendMessage(tab.id,{
                            command: 'getTotals',
                            numTotals,
                            /** The first column with a pending liability */
                            startColumn: 5
                        });
                        totals[taxType] = totalsResponse.totals;
                        task.complete = true;
                        task.state = 'success';
                        resolve();
                    } finally {
                        io.log(`Finished generating ${taxType} report`);
                    }
                } catch (error) {
                    if (debug) {
                        console.error(error);
                    }
                    resolve();
                    let errorString = error.message;
                    if (error.message === 'tax_type_not_found') {
                        // TODO: Don't show the tax type if it's under a task which
                        // already has the tax type in it's title
                        errorString = taxType+' tax type not found';
                    }
                    task.complete = true;
                    task.state = 'error';
                    task.status = errorString;
                    io.showError(errorString);
                } finally {
                    if (tab) {
                        try {
                            await browser.tabs.remove(tab.id);
                        } catch (error) {
                            // If we fail to close the tab then it's probably already closed
                        }
                    }
                }
            }));
        }
        Promise.all(promises).then(() => {
            const rows = [];
            let i = 0;
            for (const taxType of Object.values(taxTypes)) {
                let firstCol = '';
                if (i === 0) {
                    firstCol = client.name;
                }
                if (totals[taxType]) {
                    rows.push([firstCol , taxType, ...totals[taxType]]);
                } else {
                    const cols = [firstCol , taxType];
                    for (let j=0;j<numTotals;j++) {
                        cols.push("");
                    }
                    rows.push(cols);
                }
                i++;
            }
            io.output(Papa.unparse(rows, {
                quotes: true,
            }));
            resolve();
        });
    });
});

/**
 * 
 * @param {ClientAction} action 
 */
async function allClientsAction(action) {
    if (clientList.length > 0) {
        for (let i=0;i<clientList.length;i++) {
            const client = clientList[i];
            await action.run(client);
        }
    } else {
        io.setCategory('client_action');
        io.showError('No clients found');
    }
}

$(document).on('click', '.zra-action', (e) => {
    if (e.currentTarget.id === 'get-all-pending-liabilities') {
        allClientsAction(getAllPendingLiabilitiesAction);
    }
});

$(document).on('click', '.task .open-details', (e) => {
    const target = $(e.currentTarget);
    target.closest('.task').toggleClass('open');
});

function validateClient(client) {
    if (client.name && client.username && client.password) {
        const tpin = client.username;
        if (!(/\d{10}/.test(tpin) && tpin.length === 10)) {
            throw new Error(`Client "${client.username}" has an invalid TPIN`);
        }
    } else {
        throw new Error(`client_invalid`);
    }
}

$('#clientListInput').on('input', (e) => {
    const clientListFile = e.target.files[0];
    const fileReader = new FileReader();
    fileReader.onload = function (fileLoadedEvent) {
        const text = fileLoadedEvent.target.result;
        const parsed = Papa.parse(text);
        const rows = parsed.data.slice(1,parsed.data.length);
        clientList = [];
        for (const row of rows) {
            if (row.length === 3) {
                clientList.push({
                    name: row[0],
                    username: row[1],
                    password: row[2],
                });
            }
        }
    }
    fileReader.readAsText(clientListFile, 'UTF-8');
});