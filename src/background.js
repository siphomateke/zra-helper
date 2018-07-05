console.log("background script loaded");

const taxTypes = ['ITX', 'VAT', 'PAYE', 'WHT'];

function log(value) {
	browser.runtime.sendMessage({
		type: 'log',
		from: 'background',
		value: value,
	});
}

async function getAllPendingLiabilities() {
	try {
		// TODO: Auto open ZRA tab and login
		let promises = [];
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
				log(`Generating ${taxType} report`);
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
						command: "getTotals",
					});
					resolve({
						taxType: taxTypes[i],
						totals: totalsResponse.totals,
					});
				} catch (error) {
					reject(error);
				}
			}));
		}
	}
	catch (error) {
		console.error('Error: ', error);
	}
}

function tabLoaded(desiredTabId) {
	return new Promise((resolve) => {
		function listener(tabId, changeInfo) {
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

function generateTaxTotals(type, totals) {
	return [type, ...totals].join(',');
}

browser.runtime.onMessage.addListener(async (message) => {
	if (message.command === "getAllPendingLiabilities") {
		await getAllPendingLiabilities();
	}
});

browser.browserAction.onClicked.addListener(() => {
	console.log('Opening dashboard');
	browser.tabs.create({url: 'src/dashboard/dashboard.html'});
});