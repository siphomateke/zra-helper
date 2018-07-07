const taxTypes = ['ITX', 'VAT', 'PAYE', 'WHT', 'TOT'];

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
        this.logWrapperEl = document.querySelector('#log-wrapper');
        this.logElement = document.querySelector('#log');

        this.outputElement = document.querySelector('#output');

        this.errors = [];

        this.progressElement = document.querySelector('#progress');
        this.progress = -2;
    }
    setCategory(category) {
        this.category = category;
    }
    log(value, type) {
        this.logLines.push(value);
        if (this.logLines.length > 0) {
            this.logWrapperEl.classList.remove('hidden');
        }
        const now = new Date(Date.now());
        let timestamp = now.getDate()+'/'+now.getMonth()+'/'+now.getFullYear();
        timestamp += ' '+now.getHours()+':'+now.getMinutes()+':'+now.getSeconds()+':'+now.getMilliseconds();
        let text = '['+timestamp+'] '+this.category+': '+value+'<br>'
        if (type === 'error') {
            text = '<span class="error">'+text+'</span>';
        }
        this.logElement.innerHTML += text;
    }
    clearLog() {
        this.logElement.innerHTML = '';
    }
    showError(error) {
        this.errors.push(error);
        this.log('[Error] '+error, 'error');
    }
    output(row) {
        this.outputElement.value += row+'\n';
    }
    clearOutput() {
        this.outputElement.value = '';
    }
    refreshProgress() {
        this.progressElement.value = this.progress;
        if (this.progress !== -2) {
            this.progressElement.classList.remove('hidden');
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
        this.progressElement.max = this.progressMax;
    }
}

const io = new IO();

function getAllPendingLiabilitiesAction() {
	// TODO: Auto open ZRA tab and login
    let promises = [];
    const totals = {};
    io.setCategory('pending_liabilities');
    io.setProgress(0);
    io.setProgressMax(taxTypes.length);
	for (let i=0;i<taxTypes.length;i++) {
        promises.push(new Promise(async (resolve, reject) => {
            const tab = await browser.tabs.create({
                url: 'https://www.zra.org.zm/reportController.htm?actionCode=pendingLiability',
                active: false,
            });
            await tabLoaded(tab.id);
            await browser.tabs.executeScript(tab.id, {file: 'vendor/browser-polyfill.min.js'});
            await browser.tabs.executeScript(tab.id, {file: 'src/content_scripts/generate_report.js'});

            const taxType = taxTypes[i];
            io.log(`Generating ${taxType} report`);
            try {
                const response = await browser.tabs.sendMessage(tab.id, {
                    command: 'generateReport',
                    taxTypeId: i
                });
                if (response.error) {
                    throw new Error(response.error);
                }
                // Get Totals
                await tabLoaded(tab.id);
                await browser.tabs.executeScript(tab.id, {file: 'vendor/browser-polyfill.min.js'});
                await browser.tabs.executeScript(tab.id, {file: 'src/content_scripts/get_totals.js'});
                const totalsResponse = await browser.tabs.sendMessage(tab.id,{
                    command: 'getTotals',
                });
                totals[taxType] = totalsResponse.totals;
                resolve();
            } catch (error) {
                resolve();
                let errorString = error.message;
                if (error.message === 'tax_type_not_found') {
                    errorString = taxType+' tax type not found';
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
        for (const taxType of taxTypes) {
            if (totals[taxType]) {
                io.output([taxType, ...totals[taxType]].join(','));
            }
        }
    });
}

document.addEventListener("click", (e) => {
    if (e.target.classList.contains("zra-action")) {
        if (e.target.id === "get-all-pending-liabilities") {
            getAllPendingLiabilitiesAction();
        }
    }
});