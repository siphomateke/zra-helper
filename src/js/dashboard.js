const taxTypes = {
    '01': 'ITX',
    '02': 'VAT',
    '03': 'PAYE',
    '05': 'TOT',
    '06': 'WHT',
    '07': 'TLEVY',
    '08': 'MINROY',
    '09': 'PTT',
};

/**
 * @typedef Client
 * @property {string} name
 * @property {string} username
 * @property {string} password
 */

/** @type {Client[]} */
let clientList = [];

function tabLoaded(desiredTabId) {
	return new Promise((resolve) => {
		function listener(tabId, changeInfo) {
            // TODO: Handle no internet
			if (tabId === desiredTabId && changeInfo.status === 'complete') {
				browser.tabs.onUpdated.removeListener(listener);
				resolve();
			}
		}
		browser.tabs.onUpdated.addListener(listener);
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
        this._status = '';

        this._progress = -2;
        this._progressMax = 100;

        this._complete = false;
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
        } else {
            $('.tasks').append(this.els.root);
        }

        this.els.content.append(this.els.title);
        this.els.content.append(this.els.progress);
        this.els.content.append(this.els.status);
        if (!this.hasParent) {
            this.els.content.append(this.els.detailsButton);
        }

        this.els.root.append(this.els.content);

        this.status = this._status;
        this.id = lastTaskId;
        tasks[this.id] = this;
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
    }
    get progressMax() {
        return this._progressMax;
    }
    set progressMax(max) {
        this._progressMax = max;
        this.els.progress.attr('max', this._progressMax);
    }
    autoUpdateProgress() {
        this.progress = 0;
        this.progressMax = 0;
        for (const taskId of Object.keys(tasks)) {
            const task = tasks[taskId];
            this.progress += task.progress;
            this.progressMax += task.progressMax;
        }
    }
    get complete() {
        return this._complete;
    }
    set complete(complete) {
        this._complete = complete;
        this.status = '';
        if (this._complete) {
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
    }
}

const io = new IO();

/**
 * Creates a new tab, logs in and then closes the tab
 * @async
 * @param {Client} client 
 */
async function login(client) {
    io.setCategory('login');
    io.log(`Login client "${client.name}"`);
    const tab = await browser.tabs.create({url: 'https://www.zra.org.zm', active: false});
    await tabLoaded(tab.id);
    // Click login button
    await browser.tabs.executeScript(tab.id, {code: 'document.querySelector("#leftMainDiv>tbody>tr:nth-child(2)>td>div>div>div:nth-child(2)>table>tbody>tr:nth-child(1)>td:nth-child(1)>ul>li>a").click()'});
    await tabLoaded(tab.id);
    
    await browser.tabs.executeScript(tab.id, {file: 'vendor/ocrad.js'});
    await browser.tabs.executeScript(tab.id, {file: 'vendor/browser-polyfill.min.js'});
    await browser.tabs.executeScript(tab.id, {file: 'content_scripts/login.js'});
    // Actually login
    await browser.tabs.sendMessage(tab.id, {
        command: 'login',
        client,
    });
    await tabLoaded(tab.id);
    io.log(`Done logging in "${client.name}"`);
    // Don't need to wait for the tab to close to carry out logged in actions
    browser.tabs.remove(tab.id);
}

/**
 * Creates a new tab, logs out and then closes the tab
 * @async
 */
async function logout(client) {
    io.setCategory('logout');
    io.log(`Logging out "${client.name}"`);
    const tab = await browser.tabs.create({url: 'https://www.zra.org.zm/main.htm?actionCode=showHomePageLnclick', active: false});
    await browser.tabs.executeScript(tab.id, {code: 'document.querySelector("#headerContent>tbody>tr>td:nth-child(3)>a:nth-child(23)").click()'});
    io.log(`Done logging out "${client.name}"`);
    // Note: The tab automatically closes after pressing logout
    browser.tabs.remove(tab.id);
}

function getAllPendingLiabilitiesAction(client) {
    return new Promise((resolve) => {
        let promises = [];
        const totals = {};
        const mainTask = new Task(client.name+': Get all pending liabilities');
        mainTask.progressMax = 4 * Object.keys(taxTypes).length;
        mainTask.progress = 0;
        io.setCategory('pending_liabilities');
        io.setProgress(0);
        io.setProgressMax(Object.keys(taxTypes).length);
        for (const taxTypeId of Object.keys(taxTypes)) {
            promises.push(new Promise(async (resolve, reject) => {
                const taxType = taxTypes[taxTypeId];
                const task = new Task(`Get ${taxType} totals`, mainTask.id);
                task.progress = 0;
                task.progressMax = 4;
                task.status = 'Opening tab';

                io.log(`Generating ${taxType} report`);

                const tab = await browser.tabs.create({
                    url: 'https://www.zra.org.zm/reportController.htm?actionCode=pendingLiability',
                    active: false,
                });
                await tabLoaded(tab.id);

                task.status = 'Selecting tax type';
                task.progress++;
                mainTask.autoUpdateProgress();

                await browser.tabs.executeScript(tab.id, {file: 'vendor/browser-polyfill.min.js'});
                await browser.tabs.executeScript(tab.id, {file: 'content_scripts/generate_report.js'});

                try {
                    task.status = 'Generating report';
                    task.progress++;
                    mainTask.autoUpdateProgress();

                    const response = await browser.tabs.sendMessage(tab.id, {
                        command: 'generateReport',
                        taxTypeId: taxTypeId
                    });
                    if (response.error) {
                        throw new Error(response.error);
                    }
                    // Get Totals
                    await tabLoaded(tab.id);

                    task.status = 'Getting totals';
                    task.progress++;
                    mainTask.autoUpdateProgress();

                    await browser.tabs.executeScript(tab.id, {file: 'vendor/browser-polyfill.min.js'});
                    await browser.tabs.executeScript(tab.id, {file: 'content_scripts/get_totals.js'});
                    const totalsResponse = await browser.tabs.sendMessage(tab.id,{
                        command: 'getTotals',
                    });
                    totals[taxType] = totalsResponse.totals;
                    task.complete = true;
                    task.state = 'success';
                    mainTask.autoUpdateProgress();
                    resolve();
                } catch (error) {
                    resolve();
                    let errorString = error.message;
                    if (error.message === 'tax_type_not_found') {
                        errorString = taxType+' tax type not found';
                        task.complete = true;
                        task.state = 'error';
                        mainTask.autoUpdateProgress();
                    }
                    io.showError(errorString);
                } finally {
                    browser.tabs.remove(tab.id);
                    io.addProgress(1);
                    io.log(`Finished generating ${taxType} report`);
                }
            }));
        }
        Promise.all(promises).then(() => {
            mainTask.state = 'success';
            for (const taxType of Object.values(taxTypes)) {
                if (totals[taxType]) {
                    let row = [taxType, ...totals[taxType]];
                    row = row.map((total) => '"'+total+'"');
                    io.output(row.join(','));
                }
            }
            resolve();
        });
    });
}

async function allClientsAction(action) {
    if (clientList.length > 0) {
        for (let i=0;i<clientList.length;i++) {
            const client = clientList[i];
            try {
                validateClient(client);
                await login(client);
                await action(client);
                await logout();    
            } catch (e) {
                let errorString = e.message;
                if (e.message === 'client_invalid') {
                    errorString = `Row number ${i} is not a valid client`;
                }
                io.setCategory('client_action');
                io.showError(errorString);
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