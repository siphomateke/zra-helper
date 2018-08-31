import $ from 'jquery';
import Papa from 'papaparse';
import {taskStates, Task} from './tasks';
import {log} from './log';
import { 
    executeScript, 
    tabLoaded, 
    sendMessage, 
    clickElement, 
    createTab, 
    createTabPost, 
    saveAsMHTML, 
    waitForDownloadToComplete
} from './utils';
import moment from 'moment';
import config from './config';
import { ElementNotFoundError } from './errors';

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

const clientActions = {};

class ClientAction {
    constructor(taskName, id, action) {
        this.mainTask = null;
        this.taskName = taskName;
        this.id = id;
        this.logCategory = id;
        this.action = action;
        
        this.output = new Output();

        const field = $(`<div class="control"><label class="checkbox"><input type="checkbox" name="actions" value="${id}"> ${taskName}</label></div>`);
        $('#actions-field').append(field);

        clientActions[this.id] = this;
    }

    /**
     * Logs in a client and retries if already logged in as another client
     * @param {Client} client 
     * @param {Task} parentTask
     * @param {number} [maxAttempts=2] 
     */
    async robustLogin(client, parentTask, maxAttempts=2) {
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
        this.mainTask = new Task(client.name+': '+this.taskName);
        this.mainTask.progress = -1;
        try {
            this.mainTask.status = 'Logging in';
            await this.robustLogin(client, this.mainTask);

            this.mainTask.status = this.taskName;
            let task = new Task(this.taskName, this.mainTask.id);
            await this.action(client, task, this.output);
            if (task.state === taskStates.ERROR) {
                this.mainTask.state = taskStates.ERROR;
            }

            this.mainTask.status = 'Logging out';
            await logout(this.mainTask);

            if (this.mainTask.state !== taskStates.ERROR) {
                this.mainTask.state = taskStates.SUCCESS;
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

new ClientAction('Get all pending liabilities', 'pending_liabilities', 
    /**
     * @param {Client} client
     * @param {Task} parentTask
     * @param {Output} output
     */
    function (client, parentTask, output) {
        return new Promise((resolve) => {
            let promises = [];
            /** Total number of pending liabilities including the grand total */
            const numTotals = 4;
            const totals = {};
            log.setCategory(this.id);
            parentTask.sequential = false;
            for (const taxTypeId of Object.keys(taxTypes)) {
                promises.push(new Promise(async (resolve) => {
                    const taxType = taxTypes[taxTypeId];
                    const task = new Task(`Get ${taxType} totals`, parentTask.id);
                    task.progressMax = 4;
                    task.status = 'Opening tab';

                    log.log(`Generating ${taxType} report`);

                    let tab = null;
                    try {
                        tab = await createTab('https://www.zra.org.zm/reportController.htm?actionCode=pendingLiability');
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
                                // Set the current page to be the last one by clicking the "last page" button.
                                await clickElement(tab.id, '#navTable>tbody>tr:nth-child(2)>td:nth-child(5)>a', 'last page button');
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
                        resolve();
                        task.state = taskStates.ERROR;
                        task.error = error;
                        let status = '';
                        if (error.type === 'TaxTypeNotFoundError') {
                            // By default the `TaxTypeNotFoundError` contains the tax type.
                            // We don't need to show the tax type in the status since it's under
                            // a task which already has the tax type in it's title.
                            status = 'Tax type not found';
                        } else {
                            status = task.getStatusFromError();
                        }
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
                let errorCount = 0;
                let taxTypeErrorCount = 0;
                for (const task of parentTask.getChildren()) {
                    if (task.state === taskStates.ERROR) {
                        if (task.error.type !== 'TaxTypeNotFoundError') {
                            errorCount++;
                        } else {
                            taxTypeErrorCount++;
                        }
                    }
                }
                if (errorCount > 0) {
                    parentTask.state = taskStates.ERROR;
                } else if (taxTypeErrorCount === parentTask.children.length) {
                    // If all sub tasks don't have a tax type, something probably went wrong
                    parentTask.state = taskStates.WARNING;
                    parentTask.status = 'No tax types found.';
                } else {
                    parentTask.state = taskStates.SUCCESS;
                }

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

const exciseTypes = {
	airtime: '20025012',
	electricalEnergy: '20025007',
	opaqueBeer: '20025011',
	otherThanOpaqueBeer: '20025008',
	fuelTerminal: '20025010',
	spiritsAndWine: '20025009',
}

function getReturnHistoryReferenceNumbers({tpin, taxType, fromDate, toDate, page, exciseType}) {
    const recordHeaders = [
        'srNo',
        'referenceNo',
        'searchCode',
        'returnPeriodFrom',
        'returnPeriodTo',
        'returnAppliedDate',
        'accountName',
        'applicationType',
        'status',
        'appliedThrough',
        'receipt',
        'submittedForm',
    ];
    return new Promise((resolve, reject) => {
        $.ajax({
            url: 'https://www.zra.org.zm/retHist.htm',
            method: 'post',
            data: {
                'retHistVO.fromDate': fromDate,
                'retHistVO.toDate': toDate,
                'retHistVO.rtnackNo': '',
                'retHistVO.rtnType': taxType,
                'retHistVO.rtnTypeExc': exciseType,
                'retHistVO.tinNo': tpin,
                currentPage: page,
                actionCode: 'dealerReturnsView',
                dispatch: 'dealerReturnsView',
            },
            success(data, textStatus, jqXHR) {
                const $html = $($.parseHTML(data));
                // TODO: Make sure all the elements exist
                // TODO: Add better errors
                const tableInfoElementSelector = '#ReturnHistoryForm>table:nth-child(8)>tbody>tr>td';
                const tableInfoElement = $html.find(tableInfoElementSelector);
                if (tableInfoElement.length > 0) {
                    const tableInfo = tableInfoElement.text();
                    if (typeof tableInfo === 'string' && tableInfo.length > 0) {
                        if (!tableInfo.includes('No Data Found')) {
                            const [_, currentPage, numPages] = tableInfo.match(/Current Page : (\d+) \/ (\d+)/);
                            let recordElements = $html.find('#ReturnHistoryForm>table.FORM_TAB_BORDER.marginStyle>tbody>tr.whitepapartd.borderlessInput');

                            if (recordElements.length > 0) {
                                const records = [];
                                recordElements.each((index, rowElement) => {
                                    const row = {};
                                    $(rowElement).find('td').each((index, columnElement) => {
                                        row[recordHeaders[index]] = $(columnElement).text().trim();
                                    });
                                    records.push(row);
                                });

                                resolve({records, currentPage, numPages});
                                return;
                            }
                        } else {
                            reject(new Error('No return history found.'));
                        }
                    } else {
                        reject(new ElementNotFoundError(`Return history table element not found.`, null, {
                            selector: tableInfoElementSelector
                        }));
                    }
                }
                reject(new Error('Unknown error retrieving return history reference numbers.'));
            },
            error(jqXHR, textStatus, error) {
                // TODO: Handle errors
                reject();
            },
        });
    });
}

async function getAllReturnHistoryReferenceNumbers({tpin, taxType, fromDate, toDate, exciseType, parentTask}) {
    const task = new Task(`Get reference numbers`, parentTask.id);
    task.progressMax = 1;
    task.status = 'Getting reference numbers from first page';

    let numPages = 1;
    const referenceNumbers = [];
    try {
        // TODO: Consider doing this in parallel
        for (let page=0;page<numPages;page++) {
            const result = await getReturnHistoryReferenceNumbers({
                tpin, 
                taxType, 
                fromDate, 
                toDate, 
                page: page+1,
                exciseType,
            });

            if (page > 0) {
                task.addStep(`Getting reference numbers from page ${(page+1)}/${numPages}`);
            } else {
                task.progress++;
            }

            for (const record of result.records) {
                if (record.appliedThrough.toLowerCase() === 'online') {
                    referenceNumbers.push(record.referenceNo);
                }
            }

            if (result.numPages <= 1) {
                break;
            } else {
                numPages = result.numPages;
                task.progressMax = numPages;
            }
        }
        task.state = taskStates.SUCCESS;
        task.status = '';
    } catch (error) {
        task.setError(error);
        throw error;
    } finally {
        task.complete = true;
    }
    return referenceNumbers;
}

async function downloadReceipt({client, taxType, referenceNumber, parentTask}) {
    const task = new Task(`Download receipt ${referenceNumber}`, parentTask.id);
    const numberOfSteps = 4;
    task.progressMax = 1 / numberOfSteps;
    const progressIncrement = task.progressMax / numberOfSteps;
    task.status = 'Opening receipt tab';
    try {
        const tab = await createTabPost({
            url: 'https://www.zra.org.zm/retHist.htm',
            data: {
                actionCode: 'printReceipt',
                flag: 'rtnHistRcpt',
                ackNo: referenceNumber,
                rtnType: taxType,
            }
        });
        try {
            task.addStep('Waiting for receipt to load', progressIncrement);
            await tabLoaded(tab.id);
            task.addStep('Converting receipt to MHTML', progressIncrement);
            const blob = await saveAsMHTML({tabId: tab.id});
            const url = URL.createObjectURL(blob);
            task.addStep('Downloading generated MHTML', progressIncrement);
            const downloadId = await browser.downloads.download({
                url, 
                filename: `receipt-${client.username}-${taxType}-${referenceNumber}.mhtml`
            });
            // TODO: Show download progress
            await waitForDownloadToComplete(downloadId);
            task.state = taskStates.SUCCESS;
            task.status = '';
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

function downloadReceipts({client, taxType, referenceNumbers, parentTask}) {
    return new Promise((resolve) => {    
        const task = new Task(`Download receipts`, parentTask.id);
        task.sequential = false;
        task.unknownMaxProgress = false;
        task.progressMax = referenceNumbers.length;
        const promises = [];
        for (const referenceNumber of referenceNumbers) {
            // TODO: Decide how to handle errors
            promises.push(new Promise((resolve) => {
                downloadReceipt({client, taxType, referenceNumber, parentTask: task}).then(resolve);
            }));
        }
        Promise.all(promises).then(() => {
            let errorCount = 0;
            for (const childTask of task.getChildren()) {
                if (childTask.state === taskStates.ERROR) {
                    errorCount++;
                }
            }
            if (errorCount > 0) {
                task.state = taskStates.ERROR;
            } else {
                task.state = taskStates.SUCCESS;
            }
            resolve();
        });
    });
}

new ClientAction('Get all returns', 'get_all_returns', 
    /**
     * @param {Client} client
     * @param {Task} parentTask
     * @param {Output} output
     */
    function (client, parentTask, output) {
        return new Promise((resolve) => {
            // TODO: Log all progress
            log.setCategory(this.id);
            const promises = [];
            parentTask.sequential = false;
            const initialMaxOpenTabs = config.maxOpenTabs;
            config.maxOpenTabs = 3;
            for (const taxTypeId of Object.keys(taxTypes)) {
                const taxType = taxTypes[taxTypeId];
                promises.push(new Promise(async (resolve) => {
                    // TODO: Fix task progress
                    const task = new Task(`Get ${taxType} receipts`, parentTask.id);
                    try {
                        const referenceNumbers = await getAllReturnHistoryReferenceNumbers({
                            tpin: client.username,
                            taxType: taxTypeId,
                            fromDate: '01/01/2013',
                            toDate: moment().format('31/12/YYYY'),
                            exciseType: exciseTypes.airtime,
                            parentTask: task,
                        });
                        await downloadReceipts({
                            taxType: taxTypeId, 
                            referenceNumbers,
                            parentTask: task,
                            client,
                        });
                        task.state = taskStates.SUCCESS;
                        task.status = '';
                        resolve();
                    } catch (error) {
                        task.setError(error);
                        resolve();
                    } finally {
                        task.complete = true;
                    }
                }));
            }
            Promise.all(promises).then(() => {
                config.maxOpenTabs = initialMaxOpenTabs;
                
                let errorCount = 0;
                for (const task of parentTask.getChildren()) {
                    if (task.state === taskStates.ERROR) {
                        errorCount++;
                    }
                }
                if (errorCount > 0) {
                    parentTask.state = taskStates.ERROR;
                } else {
                    parentTask.state = taskStates.SUCCESS;
                }
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

$(document).on('submit', '#action-form', (e) => {
    e.preventDefault();
    const data = $('#action-form').serializeArray();
    const actions = [];
    for (const field of data) {
        if (field.name === 'actions') {
            actions.push(field.value);
        }
    }
    for (const id of Object.keys(clientActions)) {
        if (actions.includes(id)) {
            allClientsAction(clientActions[id]);
        }
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
        const supportedMimeTypes = [
            'text/csv',
            'application/vnd.ms-excel',
        ];
        if (supportedMimeTypes.includes(file.type)) {
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
        } else {
            log.setCategory('load_client_list_file');
            log.showError(`Client list file must be a CSV. Expected one of the following MIME types: "${supportedMimeTypes.join('", "')}". Got "${file.type}".`);
        }
    });
}

$('[name="clientList"]').on('input', async (e) => {
    try {
        clientList = await getClientsFromFile(e.target.files[0]);
    } catch (error) {
        // TODO: See if this needs to do anything since errors are already
        // logged in getClientsFromFile
    }
});

// Updates bulma file inputs
$('.file-input').on('input', (e) => {
    const file = e.target.files[0];
    const input = $(e.target);
    input.closest('.file').addClass('has-name');
    const fileLabelEl = input.closest('.file-label');
    let fileNameEl = fileLabelEl.find('.file-name');
    if (!fileNameEl.length) {
        fileNameEl = $('<span class="file-name"></span>');
        fileLabelEl.append(fileNameEl);
    }
    fileNameEl.text(file.name);
});