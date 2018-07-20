import $ from 'jquery';
import Papa from 'papaparse';
import {errorFromJson} from './errors';
import {taskStates, Task} from './tasks';
import {log} from './log';

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
 * Waits for a tab with a specific ID to load
 * 
 * @param {number} desiredTabId 
 * @returns {Promise}
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

/**
 * Gets the active tab in the current window
 * 
 * @returns {Promise.<browser.tabs.Tab>}
 */
async function getActiveTab() {
	const tabs = await browser.tabs.query({active: true, currentWindow: true});
	if (tabs.length > 0) {
		return tabs[0];
	} else {
		return null;
	}
}

/**
 * Waits for a specific message.
 * 
 * @param {function} validator Function that checks if a message is the one we are waiting for
 */
function waitForMessage(validator) {
	return new Promise(async (resolve) => {
		function listener(message) {
			if (validator(message)) {
				browser.runtime.onMessage.removeListener(listener);
				resolve(message);
			}
		}
		browser.runtime.onMessage.addListener(listener);
	});
}

/**
 * Sends a single message to the content script(s) in the specified tab.
 * Also throws any errors received as messages.
 * 
 * @param {number} tabId 
 * @param {any} message 
 */
async function sendMessage(tabId, message) {
    const response = await browser.tabs.sendMessage(tabId, message);
    if (response.error) {
        throw errorFromJson(response.error);
    }
    return response;
}

/**
 * Creates a new tab, logs in and then closes the tab
 * 
 * @param {Client} client 
 * @param {Task} parentTask
 * @return {Promise}
 * @throws {import('./errors').ExtendedError}
 */
async function login(client, parentTask) {
    const task = new Task('Login', parentTask.id);
    task.progress = 0;
    task.progressMax = 7;
    task.status = 'Opening tab';
    
    log.setCategory('login');
    log.log(`Logging in client "${client.name}"`);
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
            // OCRAD should be imported in login.js but work with webpack
            await executeScript(tab.id, {file: 'ocrad.js'}, true);
            await executeScript(tab.id, {file: 'login.js'});
            // Actually login
            await sendMessage(tab.id, {
                command: 'login',
                client,
                maxCaptchaRefreshes: 10
            });
            task.addStep('Waiting for login to complete');
            await tabLoaded(tab.id);
            task.addStep('Checking if login was successful');
            await executeScript(tab.id, {file: 'check_login.js'});
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
        task.state = taskStates.ERROR;
        task.status = error.message;
        throw error;
    } finally {
        task.complete = true;
    }
}

/**
 * Creates a new tab, logs out and then closes the tab
 * 
 * @param {Task} parentTask
 * @return {Promise}
 */
async function logout(parentTask) {
    const task = new Task('Logout', parentTask.id);
    task.progress = 0;
    task.progressMax = 3;
    task.status = 'Opening tab';

    log.setCategory('logout');
    log.log('Logging out');
    try {
        const tab = await browser.tabs.create({url: 'https://www.zra.org.zm/main.htm?actionCode=showHomePageLnclick', active: false});
        try {
            task.addStep('Initiating logout');
            await executeScript(tab.id, {code: 'document.querySelector("#headerContent>tbody>tr>td:nth-child(3)>a:nth-child(23)").click()'});
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
        task.state = taskStates.ERROR;
        task.status = error.message;
        throw error;
    } finally {
        task.complete = true;
    }
}

class Output {
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
        this.value = this.value + row+'\n';
    }
    clear() {
        this.value = '';
    }
}

class ClientAction {
    constructor(taskName, logCategory, action) {
        this.mainTask = null;
        this.taskName = taskName;
        this.logCategory = logCategory;
        this.action = action;
        
        this.output = new Output();
    }

    async run(client) {
        this.mainTask = new Task(client.name+': '+this.taskName);
        this.mainTask.progress = -1;
        try {
            // TODO: Treat each of the following statuses as different actions with separate progresses.
            // Keep in mind that each task may updates it's parent's progress.
            this.mainTask.status = 'Logging in';
            try {
                await login(client, this.mainTask);
            } catch (error) {
                if (error.type === 'LoginError' && error.code === 'WrongClient') {
                    // TODO: Move this to login()
                    log.setCategory(this.logCategory);
                    log.showError(error, true);
                    this.mainTask.status = 'Logging out';
                    await logout(this.mainTask);
                    this.mainTask.status = 'Logging in again';
                    await login(client, this.mainTask,);
                } else {
                    throw error;
                }
            }
            this.mainTask.status = this.taskName;
            await this.action(client, this.mainTask, this.output);
            this.mainTask.status = 'Logging out';
            await logout(this.mainTask);
            this.mainTask.state = taskStates.SUCCESS;
            this.mainTask.status = '';
        } catch (error) {
            if (debug) {
                console.error(error);
            }
            log.setCategory(this.logCategory);
            log.showError(error.message);
            this.mainTask.state = taskStates.ERROR;
            this.mainTask.status = '';
        } finally {
            this.mainTask.complete = true;
        }
    }
}

const getAllPendingLiabilitiesAction = new ClientAction('Get all pending liabilities', 'pending_liabilities', 
    /**
     * @param {Client} client
     * @param {Task} mainTask
     */
    (client, mainTask, output) => {
        return new Promise((resolve) => {
            let promises = [];
            /** Total number of pending liabilities including the grand total */
            const numTotals = 4;
            const totals = {};
            log.setCategory('pending_liabilities');
            for (const taxTypeId of Object.keys(taxTypes)) {
                promises.push(new Promise(async (resolve, reject) => {
                    const taxType = taxTypes[taxTypeId];
                    const task = new Task(`Get ${taxType} totals`, mainTask.id);
                    task.progress = 0;
                    task.progressMax = 4;
                    // Failing to retrieve a tax type is not really an error so don't tell our parent task
                    task.broadcastState = false;
                    task.status = 'Opening tab';

                    log.log(`Generating ${taxType} report`);

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

                            await sendMessage(tab.id, {
                                command: 'generateReport',
                                taxTypeId: taxTypeId
                            });
                            // Get Totals
                            await tabLoaded(tab.id);

                            task.addStep('Getting totals');

                            // TODO: move this out of this function
                            async function getTotals() {
                                await executeScript(tab.id, {file: 'get_totals.js'});
                                const totalsResponse = await sendMessage(tab.id,{
                                    command: 'getTotals',
                                    numTotals,
                                    /** The first column with a pending liability */
                                    startColumn: 5
                                });
                                return totalsResponse;
                            }

                            let totalsResponse = await getTotals();
                            if (totalsResponse.numberOfPages > 1) {
                                await executeScript(tab.id, {file: 'set_totals_page.js'})
                                await sendMessage(tab.id, {
                                    command: 'setPage',
                                    page: totalsResponse.numberOfPages
                                });
                                await tabLoaded(tab.id);
                                totalsResponse = await getTotals();
                            }
                            totals[taxType] = totalsResponse.totals;
                            task.state = taskStates.SUCCESS;
                            task.status = '';
                            resolve();
                        } finally {
                            log.log(`Finished generating ${taxType} report`);
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
                        task.state = taskStates.ERROR;
                        task.status = status;
                        log.showError(error);
                    } finally {
                        if (tab) {
                            try {
                                await browser.tabs.remove(tab.id);
                            } catch (error) {
                                // If we fail to close the tab then it's probably already closed
                            }
                        }
                        task.complete = true;
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
                output.addRow(Papa.unparse(rows, {
                    quotes: true,
                }));
                resolve();
            });
        });
});

/**
 * Runs a client action on all the clients
 * 
 * @param {ClientAction} action 
 */
async function allClientsAction(action) {
    if (clientList.length > 0) {
        for (let i=0;i<clientList.length;i++) {
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

$(document).on('click', '.zra-action', (e) => {
    if (e.currentTarget.id === 'get-all-pending-liabilities') {
        allClientsAction(getAllPendingLiabilitiesAction);
    }
});

/**
 * @typedef ClientValidationResult
 * @property {boolean} valid True if the client is valid
 * @property {string[]} [errors] An array of errors that will be set when the client is invalid
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
 * @returns {ClientValidationResult}
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
 * @returns {Client[]}
 */
function getClientsFromCsv(csvString, config={}) {
    const list = [];

    log.setCategory('get_client_list');
    log.log('Parsing CSV');
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
     * @returns {number}
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
        log.showError(rowErrors[row].map(error => {
            return `CSV parse error in row ${toLineNumber(error.row)}: ${error.message}`;
        }).join(', '));
    }

    log.log('Finished parsing CSV');

    // Only attempt to parse clients if the number of row errors is less than
    // the number of parsed rows.
    if (Object.keys(rowErrors).length < parsed.data.length) {
        const fields = parsed.meta.fields;
        if (Object.keys(rowErrors).length) {
            log.log("Attempting to parse clients in rows that don't have CSV parsing errors");
        } else {
            log.log('Parsing clients');
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
                    log.log(`Parsed valid client "${client.name}"`);
                    list.push(client);
                } else {
                    const errors = validationResult.errors.join(', ');
                    log.showError(`Row ${toLineNumber(i)} is not a valid client: ${errors}`);
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
            log.log('A large number of field mismatch errors were detected. ' +
            'Make sure that a header with the same number of columns as the rest of the CSV is present.', 'info');
        }
    }
    log.log(`Parsed ${list.length} valid client(s)`);
    return list;
}

/**
 * Gets clients from a CSV file.
 * 
 * @param {File} file The CSV file to get clients from
 * @returns {Promise.<Client[]>}
 * @throws Will throw an error if the file fails to load
 */
function getClientsFromFile(file) {
    return new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        // TODO: Add file load progress
        fileReader.onload = async function (fileLoadedEvent) {
            const text = fileLoadedEvent.target.result;
            log.setCategory('load_client_list_file');
            log.log(`Successfully loaded client list file "${file.name}"`);
            resolve(getClientsFromCsv(text));
        }
        fileReader.onerror = function (event) {
            log.setCategory('load_client_list_file');
            log.showError(`Loading file "${file.name}" failed: ${event.target.error}`);
            reject(new Error(event.target.error));
        }
        log.setCategory('load_client_list_file');
        log.log(`Loading client list file "${file.name}"`);
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