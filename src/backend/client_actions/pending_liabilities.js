import Papa from 'papaparse';
import log from '@/transitional/log';
import store from '@/store';
import createTask from '@/transitional/tasks';
import { taskStates } from '@/store/modules/tasks';
import { taxTypes } from '../constants';
import { clickElement, createTab, executeScript, sendMessage, tabLoaded, closeTab } from '../utils';
import { writeJson } from '../file_utils';

/**
 * @typedef {Object} getTotalsResponse
 * @property {number} numberOfPages The total discovered number of pages.
 * @property {number[]} totals Array of totals whose length is equal to `numTotals`.
 * @see getTotals for more on numTotals.
 */

/**
 * Gets totals such as 'principal', 'interest', 'penalty' and 'total'.
 * @param {number} tabId The ID of the tab containing the report to get totals from.
 * @param {string[]} columns The columns that contain the totals we wish to retrieve
 * @returns {Promise.<getTotalsResponse>}
 */
async function getTotals(tabId, columns) {
  await executeScript(tabId, { file: 'get_totals.js' });
  const totalsResponse = await sendMessage(tabId, {
    command: 'getTotals',
    columns,
    /** The first column with a pending liability */
    startColumn: 5,
  });
  return totalsResponse;
}

/** Columns to get from the pending liabilities table */
const totalsColumns = [
  'principal',
  'interest',
  'penalty',
  'total',
];

/** @type {import('./base').ClientActionObject} */
const clientAction = {
  id: 'getAllPendingLiabilities',
  name: 'Get all pending liabilities',
  func({ parentTask }) {
    return new Promise((resolve) => {
      const promises = [];
      const totals = {};
      parentTask.sequential = false;
      parentTask.unknownMaxProgress = false;
      parentTask.progressMax = Object.keys(taxTypes).length;
      for (const taxTypeId of Object.keys(taxTypes)) {
        promises.push(new Promise(async (resolve) => {
          const taxType = taxTypes[taxTypeId];
          const task = await createTask(store, {
            title: `Get ${taxType} totals`,
            parent: parentTask.id,
            progressMax: 4,
            status: 'Opening tab',
          });

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

              let totalsResponse = await getTotals(tab.id, totalsColumns);
              if (totalsResponse.numberOfPages > 1) {
              // Set the current page to be the last one by clicking the "last page" button.
                await clickElement(tab.id, '#navTable>tbody>tr:nth-child(2)>td:nth-child(5)>a', 'last page button');
                totalsResponse = await getTotals(tab.id, totalsColumns);
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
            if (error.type === 'TaxTypeNotFoundError') {
            // By default the `TaxTypeNotFoundError` contains the tax type.
            // We don't need to show the tax type in the status since it's under
            // a task which already has the tax type in it's title.
              task.status = 'Tax type not found';
            } else {
              task.setErrorAsStatus();
            }
            log.showError(error);
          } finally {
            if (tab) {
              try {
                await closeTab(tab.id);
              } catch (error) {
              // If we fail to close the tab then it's probably already closed
              }
            }
            task.markAsComplete();
          }
        }));
      }
      Promise.all(promises).then(() => {
        let errorCount = 0;
        let taxTypeErrorCount = 0;
        for (const task of parentTask.children) {
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
        } else if (parentTask.children.length > 0 && taxTypeErrorCount === parentTask.children.length) {
        // If all sub tasks don't have a tax type, something probably went wrong
          parentTask.state = taskStates.WARNING;
          parentTask.status = 'No tax types found.';
        } else {
          parentTask.state = taskStates.SUCCESS;
        }


        parentTask.markAsComplete();
        const output = {};
        for (const taxType of Object.values(taxTypes)) {
          output[taxType] = totals[taxType];
        }
        resolve(output);
      });
    });
  },
  hasOutput: true,
  defaultOutputFormat: 'csv',
  outputFormatter(data, format) {
    if (format === 'csv') {
      const rows = [];
      const columnOrder = totalsColumns;
      for (const { client, value } of data) {
        let i = 0;
        for (const taxType of Object.values(taxTypes)) {
          const totalsObject = value[taxType];
          let firstCol = '';
          if (i === 0) {
            firstCol = client.name;
          }
          if (totalsObject) {
            const totals = [];
            for (const column of columnOrder) {
              totals.push(totalsObject[column]);
            }
            rows.push([firstCol, taxType, ...totals]);
          } else {
            const cols = [firstCol, taxType];
            for (let j = 0; j < columnOrder.length; j++) {
              cols.push('');
            }
            rows.push(cols);
          }
          i++;
        }
      }
      // TODO: Make output options configurable by user
      return Papa.unparse(rows, {
        quotes: true,
      });
    }
    return writeJson(data);
  },
};
export default clientAction;
