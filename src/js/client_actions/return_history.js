import $ from 'jquery';
import moment from 'moment';
import config from '../config';
import { taxTypes } from '../constants';
import { TaxTypeNotFoundError } from '../errors';
import { Task, taskStates } from '../tasks';
import { createTabPost, saveAsMHTML, tabLoaded, waitForDownloadToComplete } from '../utils';
import { ClientAction } from './utils';
import { getElementFromDocument } from '../content_scripts/helpers/elements';

/** 
 * @typedef {import('../constants').Client} Client 
 * @typedef {import('./utils').Output} Output
 */

const exciseTypes = {
	airtime: '20025012',
	electricalEnergy: '20025007',
	opaqueBeer: '20025011',
	otherThanOpaqueBeer: '20025008',
	fuelTerminal: '20025010',
	spiritsAndWine: '20025009',
}

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

function getReturnHistoryReferenceNumbers({tpin, taxType, fromDate, toDate, page, exciseType}) {
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
                const parser = new DOMParser();
                const doc = parser.parseFromString(data, 'text/html');
                try {
                    const tableInfoElement = getElementFromDocument(doc, '#ReturnHistoryForm>table:nth-child(8)>tbody>tr>td', 'return history table info');
                    const tableInfo = tableInfoElement.innerText;
                    if (tableInfo && !tableInfo.includes('No Data Found')) {
                        const [_, currentPage, numPages] = tableInfo.match(/Current Page : (\d+) \/ (\d+)/);
                        const records = [];
                        const recordElements = doc.querySelectorAll('#ReturnHistoryForm>table.FORM_TAB_BORDER.marginStyle>tbody>tr.whitepapartd.borderlessInput');
                        for (const recordElement of recordElements) {
                            const row = {};
                            const columns = recordElement.querySelectorAll('td');
                            Array.from(columns, (column, index) => {
                                row[recordHeaders[index]] = column.innerText.trim();
                            });
                            records.push(row);
                        }
                            resolve({records, currentPage, numPages});
                            return;
                    } else {
                        reject(new TaxTypeNotFoundError(`Tax type with id "${taxType}" not found`, null, {
                            taxTypeId: taxType,
                        }));
                    }
                    // TODO: Add custom error message for this
                    reject(new Error('Unknown error retrieving return history reference numbers.'));
                } catch (error) {
                    reject(error);
                }
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
    task.progressMax = 4;
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
            task.addStep('Waiting for receipt to load');
            await tabLoaded(tab.id);
            task.addStep('Converting receipt to MHTML');
            const blob = await saveAsMHTML({tabId: tab.id});
            const url = URL.createObjectURL(blob);
            task.addStep('Downloading generated MHTML');
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
    return new Promise((resolve, reject) => {    
        const task = new Task(`Download receipts`, parentTask.id);
        task.sequential = false;
        task.unknownMaxProgress = false;
        task.progressMax = referenceNumbers.length;
        const promises = [];
        for (const referenceNumber of referenceNumbers) {
            // TODO: Decide how to handle errors
            promises.push(new Promise((resolve) => {
                downloadReceipt({client, taxType, referenceNumber, parentTask: task})
                    .then(resolve)
                    .catch(resolve);
            }));
        }
        Promise.all(promises).then(() => {
            task.complete = true;
            if (task.childStateCounts[taskStates.ERROR] > 0) {
                task.state = taskStates.WARNING;
            } else if (task.childStateCounts[taskStates.ERROR] === task.children.length) {
                task.state = taskStates.ERROR;
                reject();
                return;
            } else {
                task.state = taskStates.SUCCESS;
            }
            resolve();
        });
    });
}

export default new ClientAction('Get all returns', 'get_all_returns', 
    /**
     * @param {Client} client
     * @param {Task} parentTask
     * @param {Output} output
     */
    function (client, parentTask, output) {
        return new Promise((resolve) => {
            // TODO: Log all progress
            const promises = [];
            parentTask.sequential = false;
            parentTask.unknownMaxProgress = false;
            parentTask.progressMax = Object.keys(taxTypes).length;
            
            const initialMaxOpenTabs = config.maxOpenTabs;
            config.maxOpenTabs = 3;

            for (const taxTypeId of Object.keys(taxTypes)) {
                const taxType = taxTypes[taxTypeId];
                promises.push(new Promise(async (resolve) => {
                    const task = new Task(`Get ${taxType} receipts`, parentTask.id);
                    task.unknownMaxProgress = false;
                    task.progressMax = 2;
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
                        task.status = '';
                        if (task.childStateCounts[taskStates.WARNING] > 0) {
                            task.state = taskStates.WARNING;
                        } else {
                            task.state = taskStates.SUCCESS;
                        }
                    } catch (error) {
                        task.setError(error);
                    } finally {
                        task.complete = true;
                        resolve();
                    }
                }));
            }
            Promise.all(promises).then(() => {
                config.maxOpenTabs = initialMaxOpenTabs;
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
                } else if (parentTask.childStateCounts[taskStates.WARNING] > 0) {
                    parentTask.state = taskStates.WARNING;
                } else {
                    parentTask.state = taskStates.SUCCESS;
                }
                
                parentTask.complete = true;
                resolve();
            });
        });
});