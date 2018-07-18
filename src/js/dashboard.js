import $ from 'jquery';
import Papa from 'papaparse';
import {errorFromJson} from './errors';

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
 * Executes a script in a particular tab
 * 
 * @param {number} tabId 
 * @param {browser.extensionTypes.InjectDetails} details 
 * @param {boolean} vendor
 * 
 * @return {Promise}
 */
async function executeScript(tabId, details, vendor=false) {
    if (details.file) {
        if (!vendor) {
            details.file = 'js/content_scripts/' + details.file;
        } else {
            details.file = 'vendor/' + details.file;
        }
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
    // TODO: Add timeout
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
        this.logElementWrapper = $('.log');
        this.logElement = this.logElementWrapper.find('.log-inner');

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
        let dateValues = [
            now.getDate(),
            now.getMonth(),
            now.getFullYear()
        ];
        let date = dateValues.map(val => val.toString().padStart(2, '0')).join('/');
        let times = [
            now.getHours(),
            now.getMinutes(),
            now.getSeconds(),
        ];
        times = times.map(val => val.toString().padStart(2, '0'));
        times.push(now.getMilliseconds().toString().padStart(3,'0'));
        let time = times.join(':');
        let timestamp = `${date} ${time}`;

        let text = this.category+': '+value;
        let classes = ['line'];
        let icon = '';
        switch (type) {
            case 'error':
                classes.push('error');
                icon = 'exclamation-circle';
                console.error(text);
                break;
            case 'warning':
                classes.push('warning');
                icon = 'exclamation-triangle';
                console.warn(text);
                break;
            case 'info':
                classes.push('info');
                icon = 'info-circle';
                console.info(text);
                break;
            default:
                console.log(text);
                break;
        }
        let output = `<span class="cell timestamp">${timestamp}</span>`;
        output += `<span class="cell icon">`;
        if (icon) {
            output += `<i class="fa fa-${icon}" aria-hidden="true"></i>`;
        }
        output += '</span>';
        output += `<span class="cell category"><span class="tag">${this.category}</span></span>`;
        output += `<span class="cell content">${value}</span>`;
        output = `<span class="${classes.join(' ')}">${output}</span>`;

        // Output log and keep scroll at bottom if already scrolled to bottom
        let scrollEl = this.logElementWrapper;
        let isScrolledToBottom = scrollEl[0].scrollHeight - scrollEl[0].clientHeight <= scrollEl[0].scrollTop + 1;
        this.logElement.append(output);
        if (isScrolledToBottom) {
            scrollEl.scrollTop(scrollEl[0].scrollHeight);
        }
    }
    clearLog() {
        this.logElement.text('');
    }
    showError(error) {
        this.errors.push(error);
        let errorString = '';
        if (!(error instanceof Error) && error.message) {
            errorString = error.message;
        } else if (typeof error !== 'string') {
            errorString = error.toString();
        } else {
            errorString = 'Error: '+error;
        }
        this.log(errorString, 'error');
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
    io.log(`Logging in client "${client.name}"`);
    try {
        const tab = await browser.tabs.create({url: 'https://www.zra.org.zm', active: false});
        task.addStep('Waiting for tab to load');
        try {
            await tabLoaded(tab.id);
            task.addStep('Navigating to login page');
            // Navigate to login page
            await executeScript(tab.id, {code: 'document.querySelector("#leftMainDiv>tbody>tr:nth-child(2)>td>div>div>div:nth-child(2)>table>tbody>tr:nth-child(1)>td:nth-child(1)>ul>li>a").click()'});
            task.addStep('Waiting for login page to load');
            await tabLoaded(tab.id);
            task.addStep('Logging in');
            // OCRAD should imported in login.js but doesn't play nice
            // with webpack
            await executeScript(tab.id, {file: 'ocrad.js'}, true);
            await executeScript(tab.id, {file: 'login.js'});
            // Actually login
            let response = await browser.tabs.sendMessage(tab.id, {
                command: 'login',
                client,
                maxCaptchaRefreshes: 10
            });
            if (response.error) {
                throw errorFromJson(response.error);
            }
            task.addStep('Waiting for login to complete');
            await tabLoaded(tab.id);
            task.addStep('Checking if login was successful');
            await executeScript(tab.id, {file: 'check_login.js'});
            response = await browser.tabs.sendMessage(tab.id, {
                command: 'checkLogin',
                client,
            });
            if (response.error) {
                throw errorFromJson(response.error);
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
            await executeScript(tab.id, {code: 'document.querySelector("#headerContent>tbody>tr>td:nth-child(3)>a:nth-child(23)").click()'});
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
            this.mainTask.status = 'Logging in';
            await login(client, this.mainTask);
            this.mainTask.status = this.taskName;
            await this.action(client, this.mainTask);
            this.mainTask.status = 'Logging out';
            await logout(client, this.mainTask);
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

                    await executeScript(tab.id, {file: 'generate_report.js'});

                    try {
                        task.addStep('Generating report');

                        const response = await browser.tabs.sendMessage(tab.id, {
                            command: 'generateReport',
                            taxTypeId: taxTypeId
                        });
                        if (response.error) {
                            throw errorFromJson(response.error);
                        }
                        // Get Totals
                        await tabLoaded(tab.id);

                        task.addStep('Getting totals');

                        await executeScript(tab.id, {file: 'get_totals.js'});
                        const totalsResponse = await browser.tabs.sendMessage(tab.id,{
                            command: 'getTotals',
                            numTotals,
                            /** The first column with a pending liability */
                            startColumn: 5
                        });
                        if (response.error) {
                            throw errorFromJson(response.error);
                        }
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
                    let status = '';
                    if (error.type === 'TaxTypeNotFound') {
                        // Don't show the tax type in the status since it's under
                        // a task which already has the tax type in it's title
                        status = 'Tax type not found';
                    } else if (error.message) {
                        status = error.message;
                    } else {
                        status = error.toString();
                    }
                    task.complete = true;
                    task.state = 'error';
                    task.status = status;
                    io.showError(error);
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
            try {
                // TODO: Consider checking if a tab has been closed prematurely all the time.
                // Currently, only tabLoaded checks for this.
                await action.run(client);
            } catch (error) {
                if (debug) {
                    console.error(error);
                }
                io.setCategory('client_action');
                io.showError(error.message);
            }
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

/**
 * @typedef ClientValidationResult
 * @property {boolean} valid True if the client is valid
 * @property {string[]} errors An array of errors that will be set when the client is invalid
 */

/**
 * Checks if a client is valid
 * 
 * The following validation rules are used on the client:
 * - has a name, username and password
 * - username is a 10 digit number
 * - password is at least 8 characters long
 * 
 * @param {Client} client The client to validate
 * @return {ClientValidationResult}
 */
function validateClient(client) {
    /** Properties that must exist on each client */
    let requiredProps = ['name', 'username', 'password'];
    let missingProps = [];
    requiredProps.map(prop => {
        if (!client[prop]) {
            missingProps.push(prop);
        }
    });
    let validationErrors = [];
    if (missingProps.length > 0) {
        let missingString = '['+missingProps.join(', ')+']';
        validationErrors.push(`Properties missing: ${missingString}`);
    }
    if (!missingProps.includes('username')) {
        const tpin = client.username;
        if (!(/\d{10}/.test(tpin) && tpin.length === 10)) {
            validationErrors.push('TPIN (username) must be a 10 digit number');
        }
    }
    if (!missingProps.includes('password') && client.password.length < 8) {
        validationErrors.push('Password must be at least 8 characters long');
    }
    if (validationErrors.length > 0) {
        return {
            valid: false,
            errors: validationErrors,
        };
    } else {
        return {valid: true};
    }
}

/**
 * Gets an array of clients from a csv string
 * 
 * @param {string} csvString The CSV to parse as a string
 * @param {Papa.ParseConfig} config CSV parsing config
 * @return {Client[]}
 */
function getClientsFromCsv(csvString, config={}) {
    const list = [];

    io.setCategory('get_client_list');
    io.log('Parsing CSV');
    let parseConfig = Object.assign({
        header: true,
        trimHeaders: true,
        skipEmptyLines: true,
    }, config);
    const parsed = Papa.parse(csvString, parseConfig);

    /**
     * Converts a row index (from Papa.parse) to a line number
     * 
     * @param {number} rowIndex 
     * @return {number}
     */
    function toLineNumber(rowIndex) {
        let lineNumber = rowIndex + 1;
        if (parseConfig.header) {
            // Since the headers aren't included in the parsed output,
            // we need to add one to get back to the original line number.
            lineNumber++;
        }
        return lineNumber;
    }

    /** 
     * An object whose keys are row numbers and the errors associated with 
     * the row numbers are values
     * @type {Object.<string, Papa.ParseError[]>} 
     */
    const rowErrors = {};
    parsed.errors.map((error) => {
        if (!Array.isArray(rowErrors[error.row])) {
            rowErrors[error.row] = [];
        }
        rowErrors[error.row].push(error);
    });
    
    // Output all the row errors
    for (const row of Object.keys(rowErrors)) {
        io.showError(rowErrors[row].map(error => {
            return `CSV parse error in row ${toLineNumber(error.row)}: ${error.message}`;
        }).join(', '));
    }

    io.log('Finished parsing CSV');

    // Only attempt to parse clients if the number of row errors is less than
    // the number of parsed rows.
    if (Object.keys(rowErrors).length < parsed.data.length) {
        const fields = parsed.meta.fields;
        if (Object.keys(rowErrors).length) {
            io.log("Attempting to parse clients in rows that don't have CSV parsing errors");
        } else {
            io.log('Parsing clients');
        }
        for (let i=0;i<parsed.data.length;i++) {
            // If there was an error parsing this row of the CSV,
            // don't attempt to use it as a client
            if (!rowErrors[i]) {
                const row = parsed.data[i];
                const client = {
                    name: row[fields[0]],
                    username: row[fields[1]],
                    password: row[fields[2]],
                };
                const validationResult = validateClient(client);
                if (validationResult.valid) {
                    io.log(`Parsed valid client "${client.name}"`);
                    list.push(client);
                } else {
                    const errors = validationResult.errors.join(', ');
                    io.showError(`Row ${toLineNumber(i)} is not a valid client: ${errors}`);
                }
            }
        }
    } else if (parsed.data.length > 0) {
        // Count the number of rows that have the field mismatch error
        let numberOfFieldMismatchErrors = 0;
        for (const errors of Object.values(rowErrors)) {
            for (const error of errors) {
                if (error.type === 'FieldMismatch') {
                    numberOfFieldMismatchErrors++;
                    break;
                }
            }
        }

        // If the number of 'FieldMismatch' errors matches the number of data rows,
        // then the header row probably has the wrong number of columns
        if (numberOfFieldMismatchErrors === parsed.data.length) {
            io.log('A large number of field mismatch errors were detected. ' +
            'Make sure that a header with the same number of columns as the rest of the CSV is present.', 'info');
        }
    }
    io.log(`Parsed ${list.length} valid client(s)`);
    return list;
}

/**
 * Gets clients from a Blob file
 * 
 * @param {Blob} file The file to get clients from
 * @return {Promise<Client[]|Error>}
 */
function getClientsFromFile(file) {
    return new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        // TODO: Add file load progress
        fileReader.onload = async function (fileLoadedEvent) {
            const text = fileLoadedEvent.target.result;
            io.setCategory('load_client_list_file');
            io.log(`Successfully loaded client list file "${file.name}"`);
            resolve(getClientsFromCsv(text));
        }
        fileReader.onerror = function (event) {
            io.setCategory('load_client_list_file');
            io.showError(`Loading file "${file.name}" failed: ${event.target.error}`);
            reject(new Error(event.target.error));
        }
        io.setCategory('load_client_list_file');
        io.log(`Loading client list file "${file.name}"`);
        fileReader.readAsText(file, 'UTF-8');
    });
}

$('#clientListInput').on('input', async (e) => {
    try {
        clientList = await getClientsFromFile(e.target.files[0]);
    } catch (error) {
        // TODO: See if this needs to do anything since errors are already
        // logged in getClientsFromFile
    }
});