import { getElement } from './helpers/elements';
import { parseTable } from './helpers/zra';
import addContentScriptListener from './helpers/listener';

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
 * @param {string[]} message.columns
 */
async function listener(message) {
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

    let totals = null;

    // Check if grand total row exists
    if (document.querySelector('#rprtDataTable>tbody>tr.rprtDataTableGrandTotalRow')) {
      const pendingLiabilitiesTable = getElement('#rprtDataTable', 'totals table');
      const pendingLiabilities = parseTable({
        root: pendingLiabilitiesTable,
        headers: recordHeaders,
        recordSelector: 'tbody>tr.rprtDataTableGrandTotalRow,tbody>tr.TablerowBG1',
      });
      const totalsRow = pendingLiabilities[pendingLiabilities.length - 1];
      totals = {};
      for (const column of message.columns) {
        totals[column] = totalsRow[column].replace(/\n\n/g, '');
      }
    } else if (document.querySelector('#rsltTableHtml>table>tbody>tr:nth-child(2)>td>center.Label3')) {
      // Check if the element that contains "No data found" exists
      totals = generateTotals(message.columns, 0);
    } else {
      totals = generateTotals(message.columns, null);
    }

    return {
      numberOfPages,
      totals,
    };
  }
  // TODO: Consider making this a custom error
  throw new Error('Invalid record number string.');
}
addContentScriptListener('getTotals', listener);
