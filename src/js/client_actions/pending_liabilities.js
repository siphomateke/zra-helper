import Papa from 'papaparse';
import { taxTypes } from '../constants';
import { log } from '../log';
import { Task, taskStates } from '../tasks';
import {
  clickElement, createTab, executeScript, sendMessage, tabLoaded,
} from '../utils';
import { ClientAction } from './base';

/**
 * @typedef {import('../constants').Client} Client
 * @typedef {import('./base').Output} Output
 */

export default new ClientAction('Get all pending liabilities', 'pending_liabilities',
  /**
     * @param {Client} client
     * @param {Task} parentTask
     * @param {Output} output
     */
  ((client, parentTask, output) => new Promise((resolve) => {
    const promises = [];
    /** Total number of pending liabilities including the grand total */
    const numTotals = 4;
    const totals = {};
    parentTask.sequential = false;
    parentTask.unknownMaxProgress = false;
    parentTask.progressMax = Object.keys(taxTypes).length;
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

          await executeScript(tab.id, { file: 'generate_report.js' });

          try {
            task.addStep('Generating report');

            await sendMessage(tab.id, {
              command: 'generateReport',
              taxTypeId,
            });
            // Get Totals
            await tabLoaded(tab.id);

            task.addStep('Getting totals');

            // TODO: move this out of this function
            async function getTotals() {
              await executeScript(tab.id, { file: 'get_totals.js' });
              const totalsResponse = await sendMessage(tab.id, {
                command: 'getTotals',
                numTotals,
                /** The first column with a pending liability */
                startColumn: 5,
              });
              return totalsResponse;
            }

            let totalsResponse = await getTotals();
            if (totalsResponse.numberOfPages > 1) {
              // Set the current page to be the last one by clicking the "last page" button.
              await clickElement(tab.id, '#navTable>tbody>tr:nth-child(2)>td:nth-child(5)>a', 'last page button');
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
          rows.push([firstCol, taxType, ...totals[taxType]]);
        } else {
          const cols = [firstCol, taxType];
          for (let j = 0; j < numTotals; j++) {
            cols.push('');
          }
          rows.push(cols);
        }
        i++;
      }
      output.addRow(Papa.unparse(rows, {
        quotes: true,
      }));
      parentTask.complete = true;
      resolve();
    });
  })));
