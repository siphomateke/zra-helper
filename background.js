const taxTypes = ['ITX', 'VAT', 'PAYE', 'WHT'];

async function getAllPendingLiabilities() {
	try {
		let activeTab = await getActiveTab();
		//Account History
		//Taxpayer Profile
		console.log('Navigating to taxpayer profile');
		await browser.tabs.executeScript({code: 'document.querySelector("#leftMainDiv>tbody>tr:nth-child(2)>td>div>div>div>div>div:nth-child(7)>a").click(); document.querySelector("[id=\\"4\\"]>li:nth-child(1)>div>a").click()' });
		await tabLoaded(activeTab.id);
		//Pending Liabilities
		console.log('Opening pending liabilities');
		await browser.tabs.executeScript({code: 'document.querySelector("#maincontainer>tbody>tr:nth-child(4)>td:nth-child(3)>form>fieldset:nth-child(5)>table>tbody>tr:nth-child(3)>td:nth-child(2)>a").click()'});
		activeTab = await getActiveTab();
		await tabLoaded(activeTab.id);

		for (let i=0;i<taxTypes.length;i++) {
			const taxType = taxTypes[i];
			console.log(`Generating ${taxType} reports`);
			await browser.tabs.executeScript({file: './content_scripts/generate_report.js'});
			try {
				const response = await browser.tabs.sendMessage({
					command: 'generateReport',
					taxTypeId: i
				});
				if (response.error) {
					throw new Error(response.error);
				}
				//Get Totals 
				await tabLoaded(activeTab.id);
				await browser.tabs.executeScript({file: './content_scripts/pending_liabilities_p4.js'});
				await browser.tabs.sendMessage(activeTab.id,{
					command: "pendingLiabilitiesP4",
					taxType,
				});
			} catch (error) {
				console.log('Generating ${taxType} reports failed with error:', error);
			}
		}


		//'document.querySelector("#rsltTableHtml>table>tbody>tr:nth-child(2)>td>center.Label3").value'
		//#rsltTableHtml>table>tbody>tr:nth-child(2)>td>center.Label3

	}
	catch (error) {
		console.error('Error: ', error);
	}
}

//await browser.tabs.sendMessage(mytab.id,{
//	command: "pendingLiabilitiesP1"
//});

/*function onError(error) {
	console.error('Error: ' + error);
}

function onExecuteScriptError(error) {
	console.error('Execute Script Error: ' + error);
}*/

console.log("background script loaded")

//browser.tabs.query({currentWindow: true, active: true})
//.then(browser.tabs.executeScript({file: "/content_scripts/pending_liabilities_p1.js"}))
//.catch(onExecuteScriptError);

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

function generateTaxTotals(type, totals) {
	return [type, ...totals].join('\t');
}

browser.runtime.onMessage.addListener(async (message) => {
	if (message.command === "getAllPendingLiabilities") {
		//getAllPendingLiabilities()
		//browser.tabs.executeScript({file: "/content_scripts/pending_liabilities_p1.js"})
		await getAllPendingLiabilities();
	}
	else if (message.dataType === 'totals') {
		console.log(generateTaxTotals(taxTypes[message.taxTypeId], message.totals));
	}
});