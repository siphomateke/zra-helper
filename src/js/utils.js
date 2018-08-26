import {errorFromJson, TabError, ExecuteScriptError, SendMessageError} from './errors';
import config from './config';

class TabCreator {
    constructor() {
        /** 
         * Array of IDs of tabs created by the extension which are currently open.
         * @type {number[]} 
         */
        this.tabs = [];
        /** The number of tabs that are currently open. */
        this.openTabsCount = 0;
        this.lastTabOpenTime = null;
        this.queue = [];
        this.drainingQueue = false;
        
        browser.tabs.onRemoved.addListener((tabId) => {
            if (this.tabs.includes(tabId)) {
                this.openTabsCount--;
                this.tabs.splice(this.tabs.indexOf(tabId), 1);
                this.drainQueue();
            }
        });
    }

    /**
     * Checks if a tab can be opened.
     * @returns {boolean}
     */
    slotFree() {
        const notMaxOpenTabs = config.maxOpenTabs === 0 || this.openTabsCount < config.maxOpenTabs;
        const timeSinceLastTabOpened = Date.now() - this.lastTabOpenTime;
        const delayLargeEnough = this.lastTabOpenTime === null || timeSinceLastTabOpened >= config.tabOpenDelay;
        return notMaxOpenTabs && delayLargeEnough;
    }

    /**
     * Loops through pending tabs and checks if they can be created.
     */
    drainQueue() {
        if (!this.drainingQueue) {
            this.drainingQueue = true;
            while (this.queue.length > 0 && this.slotFree()) {
                const callback = this.queue.shift();
                this.openTabsCount++;
                this.lastTabOpenTime = Date.now();
                this.startDrainQueueTimer();
                callback();
            }
            this.drainingQueue = false;
        }
    }

    /**
     * Starts a timer that triggers `drainQueue()` after `config.tabOpenDelay`.
     */
    startDrainQueueTimer() {
        if (config.tabOpenDelay > 0) {
            setTimeout(() => {
                this.drainQueue();
            }, config.tabOpenDelay);
        }
    }

    waitForFreeTabSlot() {
        return new Promise((resolve) => {
            this.queue.push(resolve);
            this.drainQueue();
        });
    }

    async create(createProperties) {
        await this.waitForFreeTabSlot();
        const tab = await browser.tabs.create(createProperties);
        this.tabs.push(tab.id);
        return tab;
    }
}

export const tabCreator = new TabCreator();

/**
 * Creates a new tab.
 * @param {string} url The URL to navigate the tab to initially
 * @param {boolean} active Whether the tab should become the active tab in the window.
 */
export function createTab(url, active=false) {
    return tabCreator.create({url, active});
}

/**
 * Executes a script in a particular tab
 * 
 * @param {number} tabId 
 * @param {browser.extensionTypes.InjectDetails} details 
 * @param {boolean} vendor
 * @throws {ExecuteScriptError}
 */
export async function executeScript(tabId, details, vendor=false) {
    if (details.file) {
        if (!vendor) {
            details.file = 'js/content_scripts/' + details.file;
        } else {
            details.file = 'vendor/' + details.file;
        }
    }
    try {
        await browser.tabs.executeScript(tabId, details);
    } catch (error) {
        let errorString = error.message ? error.message : error.toString();
        // If the extension does not have permission to execute a script on this tab,
        // then this tab is probably the browser error page which usually only
        // shows up when the user is offline.
        if (error.message && (
            error.message.includes('Cannot access contents of url "chrome-error://chromewebdata/"') ||
            error.message.includes('Missing host permission for the tab'))) {
                
            throw new ExecuteScriptError(`Cannot access tab with ID ${tabId}. Please check your internet connection and try again.`, 'NoAccess', {tabId});
        }
        throw new ExecuteScriptError(`Failed to execute script: "${errorString}"`, null, {tabId});
    }
}

/**
 * Waits for a tab with a specific ID to load
 * 
 * @param {number} desiredTabId 
 * @param {number} [timeout] The amount of time to wait for a tab to load (in milliseconds). Default value is the one set in config.
 * @returns {Promise}
 * @throws {TabError} Throws an error if the tab is closed before it loads
 */
export function tabLoaded(desiredTabId, timeout=null) {
    if (timeout === null) timeout = config.tabLoadTimeout;

	return new Promise((resolve, reject) => {
		function updatedListener(tabId, changeInfo) {
			if (tabId === desiredTabId && changeInfo.status === 'complete') {
                removeListeners();
				resolve();
			}
		}
        function removedListener(tabId) {
            if (tabId === desiredTabId) {
                removeListeners();
                reject(new TabError(`Tab with ID ${tabId} was closed before it could finish loading.`, 'Closed', {tabId}));
            }
        }
        function removeListeners() {
            browser.tabs.onUpdated.removeListener(updatedListener);
            browser.tabs.onRemoved.removeListener(removedListener);
        }

		browser.tabs.onUpdated.addListener(updatedListener);
        browser.tabs.onRemoved.addListener(removedListener);

        setTimeout(() => {
            removeListeners();
            reject(new TabError(`Timed out waiting for tab with ID ${desiredTabId} to load`, 'TimedOut', {
                tabId: desiredTabId
            }));
        }, timeout);
	});
}

/**
 * Gets the active tab in the current window
 * 
 * @returns {Promise.<browser.tabs.Tab>}
 */
export async function getActiveTab() {
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
export function waitForMessage(validator) {
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
 * @throws {SendMessageError}
 */
export async function sendMessage(tabId, message) {
    let response;
    try {
        response = await browser.tabs.sendMessage(tabId, message);
    } catch (error) {
        let errorString = error.message ? error.message : error.toString();
        throw new SendMessageError(`Failed to send message to tab with ID ${tabId}: "${errorString}"`);
    }
    if (response.error) {
        throw errorFromJson(response.error);
    }
    return response;
}

/**
 * Clicks on an element with the specified selector that is in a tab with the specified ID.
 * @param {number} tabId The ID of the tab on which the element resides.
 * @param {string} selector The selector of the element.
 * @param {string} name A descriptive name of the element used when generating errors.
 * For example, "generate report button".
 */
export async function clickElement(tabId, selector, name=null) {
    await executeScript(tabId, {file: 'click_element.js'});
    await sendMessage(tabId, {
        command: 'click',
        selector,
        name,
    });
}