import { parseReportTable } from '@/backend/content_scripts/helpers/zra';
import addContentScriptListener from '@/backend/content_scripts/helpers/listener';

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
  const response = await parseReportTable({
    root: document,
    headers: recordHeaders,
  });
  const pendingLiabilities = response.records;

  let totals = null;

  // Make sure there are some records (including the grand total row).
  if (
    pendingLiabilities.length > 0
    && document.querySelector('#rprtDataTable>tbody>tr.rprtDataTableGrandTotalRow')
  ) {
    const totalsRow = pendingLiabilities[pendingLiabilities.length - 1];
    totals = {};
    for (const column of message.columns) {
      totals[column] = totalsRow[column].replace(/\n\n/g, '');
    }
  } else {
    totals = generateTotals(message.columns, 0);
  }

  return {
    numPages: response.numPages,
    totals,
  };
}
addContentScriptListener('get_totals', listener);
