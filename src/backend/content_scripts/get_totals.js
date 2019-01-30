import { errorToJson } from '../errors';
import { getElement } from './helpers/elements';
import { parseTable } from './helpers/zra';

const recordHeaders = [
  'srNo',
  'accountName',
  'periodFrom',
  'periodTo',
  'principal',
  'interest',
  'penalty',
  'total',
];

/**
 * Generates an object with totals that are all one value.
 * @param {string[]} columns
 * @param {any} value
 * @returns {Object.<string, any>}
 */
function generateTotals(columns, value) {
  const totals = {};
  for (const column of columns) {
    totals[column] = value;
  }
  return totals;
}

/**
 * @param {Object} message
 * @param {string} message.command
 * @param {string[]} message.columns
 */
function listener(message) {
  return new Promise((resolve) => {
    if (message.command === 'getTotals') {
      try {
        const numRecordsEl = getElement('#navTable>tbody>tr:nth-child(1)>td.Label3', 'number of records');
        /**
         * String that contains the number of records.
         * For example: "Displaying 21 to 21 of 21 records."
         */
        const numRecordsString = numRecordsEl.innerText;
        const matches = numRecordsString.match(/Displaying (\d+) to (\d+) of (\d+) records\./i);
        if (matches && matches.length === 4) {
          const recordsPerPage = 20;
          const numberOfPages = Math.ceil(matches[3] / recordsPerPage);

          // Check if grand total row exists
          if (document.querySelector('#rprtDataTable>tbody>tr.rprtDataTableGrandTotalRow')) {
            const pendingLiabilitiesTable = getElement('#rprtDataTable', 'totals table');
            const pendingLiabilities = parseTable({
              root: pendingLiabilitiesTable,
              headers: recordHeaders,
              recordSelector: 'tbody>tr.rprtDataTableGrandTotalRow,tbody>tr.TablerowBG1',
            });
            const totalsRow = pendingLiabilities[pendingLiabilities.length - 1];
            const totals = {};
            for (const column of message.columns) {
              totals[column] = totalsRow[column].replace(/\n\n/g, '');
            }
            resolve({
              numberOfPages,
              totals,
            });
          } else if (document.querySelector('#rsltTableHtml>table>tbody>tr:nth-child(2)>td>center.Label3')) {
            // Check if the element that contains "No data found" exists

            resolve({
              numberOfPages,
              totals: generateTotals(message.columns, 0),
            });
          } else {
            resolve({
              numberOfPages,
              totals: generateTotals(message.columns, null),
            });
          }
        } else {
          // TODO: Consider making this a custom error
          throw new Error('Invalid record number string.');
        }
      } catch (error) {
        resolve({ error: errorToJson(error) });
      }
    }
  });
}
browser.runtime.onMessage.addListener(listener);
