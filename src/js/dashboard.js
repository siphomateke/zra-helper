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

const io = new IO();

function getAllPendingLiabilitiesAction() {
	// TODO: Auto open ZRA tab and login
    let promises = [];
    const totals = {};
    io.setCategory('pending_liabilities');
    io.setProgress(0);
    io.setProgressMax(taxTypes.length);
	for (const taxTypeId of Object.keys(taxTypes)) {
        promises.push(new Promise(async (resolve, reject) => {
            const tab = await browser.tabs.create({
                url: 'https://www.zra.org.zm/reportController.htm?actionCode=pendingLiability',
                active: false,
            });
            await tabLoaded(tab.id);
            await browser.tabs.executeScript(tab.id, {file: 'vendor/browser-polyfill.min.js'});
            await browser.tabs.executeScript(tab.id, {file: 'content_scripts/generate_report.js'});

            const taxType = taxTypes[taxTypeId];
            io.log(`Generating ${taxType} report`);
            try {
                const response = await browser.tabs.sendMessage(tab.id, {
                    command: 'generateReport',
                    taxTypeId: taxTypeId
                });
                if (response.error) {
                    throw new Error(response.error);
                }
                // Get Totals
                await tabLoaded(tab.id);
                await browser.tabs.executeScript(tab.id, {file: 'vendor/browser-polyfill.min.js'});
                await browser.tabs.executeScript(tab.id, {file: 'content_scripts/get_totals.js'});
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

$(document).on('click', '.zra-action', (e) => {
    if (e.currentTarget.id === 'get-all-pending-liabilities') {
        getAllPendingLiabilitiesAction();
    }
});