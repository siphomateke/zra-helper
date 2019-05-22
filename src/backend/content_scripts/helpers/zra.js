import { ZraError } from '../../errors';
import { getElementFromDocument } from './elements';

/**
 * Gets error message from page if it exists
 * @param {Document} document
 * @returns {ZraError|null}
 */
export function getZraError(document) {
  // eslint-disable-next-line max-len
  const errorTable = document.querySelector('#maincontainer>tbody>tr:nth-child(4)>td:nth-child(3)>form>div>table>tbody>tr>td>table');
  if (errorTable !== null) {
    const errorTableHeader = errorTable.querySelector('tbody>tr.tdborder>td');
    if (errorTableHeader !== null && errorTableHeader.innerText.includes('An Error has occurred')) {
      const error = errorTable.querySelector('tbody>tr:nth-child(2)>td');
      if (error !== null) {
        return new ZraError(`${errorTableHeader.innerText.trim()}. ${error.innerText}`, null, {
          error: error.innerText,
        });
      }
    }
  }
  return null;
}

/**
 * @typedef {Object} ParsedTableLinkCell
 * @property {string} innerText
 * @property {string} onclick
 */

/**
 * @typedef {Object.<string, string>} ParsedTableRecord
 * Object representing a single row whose keys are column headers and whose values are the
 * corresponding cell values.
 */

/**
 * Parses ZRA tables and returns the records.
 * @param {Object} options
 * @param {Document|Element} options.root Document to get records from
 * @param {string[]} options.headers Column headers
 * @param {string} options.recordSelector
 * Selector of a single table data row. This shouldn't match any header rows.
 * @param {boolean} [options.parseLinks]
 * Whether the `onclick` attribute of links should also be parsed. If set to true, cells with links
 * will be of type [ParsedTableLinkCell]{@link ParsedTableLinkCell}.
 * @returns {ParsedTableRecord[]}
 */
export function parseTable({
  root,
  headers,
  recordSelector,
  parseLinks = false,
}) {
  const records = [];
  const recordElements = root.querySelectorAll(recordSelector);
  for (const recordElement of recordElements) {
    const row = {};
    const columns = recordElement.querySelectorAll('td');
    for (let index = 0; index < columns.length; index++) {
      const column = columns[index];
      let value = column.innerText.trim();
      if (parseLinks) {
        const link = column.querySelector('a');
        if (link) {
          const onclick = link.getAttribute('onclick');
          if (onclick) {
            value = {
              innerText: value,
              onclick,
            };
          }
        }
      }
      row[headers[index]] = value;
    }
    records.push(row);
  }
  return records;
}

/**
 * @typedef ParsedTable
 * @property {ParsedTableRecord[]} records Array of records
 * @property {number} currentPage The current page
 * @property {number} numPages The total number of pages
 */

/**
 * Parses ZRA tables and returns the records, current page and number of pages.
 * @param {Object} options
 * @param {Document|Element} options.root Document to get elements from
 * @param {string[]} options.headers Column headers
 * @param {string} options.tableInfoSelector
 * Selector of the element that contains information about the table such as the current page.
 * @param {string} options.recordSelector
 * Selector of a single table data row. This shouldn't match header rows.
 * @param {string} [options.noRecordsString] String that will exist when there are no records
 * @param {boolean} [options.parseLinks]
 * Whether the `onclick` attribute of links should also be parsed. If set to true, cells with links
 * will be of type [ParsedTableLinkCell]{@link ParsedTableLinkCell}.
 * @returns {Promise.<ParsedTable>}
 */
export async function parseTableAdvanced({
  root,
  headers,
  tableInfoSelector,
  recordSelector,
  noRecordsString = 'No Records Found',
  parseLinks = false,
}) {
  const tableInfoElement = getElementFromDocument(root, tableInfoSelector, 'table info');
  const tableInfo = tableInfoElement.innerText;
  let currentPage = 1;
  let numPages = 0;
  let records = [];
  if (!tableInfo.includes(noRecordsString)) {
    const tableInfoMatches = tableInfo.match(/Current Page : (\d+)\s*\/\s*(\d+)/);
    currentPage = Number(tableInfoMatches[1]);
    numPages = Number(tableInfoMatches[2]);
    records = parseTable({
      root,
      headers,
      recordSelector,
      parseLinks,
    });
  }
  return {
    records,
    currentPage,
    numPages,
  };
}

/**
 * @template Record
 * @typedef {Object} ParsedReportTable
 * @property {ParsedTableRecord[] | Record[]} records
 * @property {number} numPages
 * @property {number} currentPage
 */

/**
 * Parses rslt report tables.
 * These are used by the pending liabilities and the tax payer ledger reports.
 * @template Record
 * @param {Object} options
 * @param {Document|Element} options.root
 * @param {string[]} options.headers
 * @returns {Promise.<ParsedReportTable<Record>>}
 */
export async function parseReportTable({ root, headers }) {
  let numPages = null;
  let currentPage = null;
  let records = null;
  // Check if the element that contains "No data found" exists
  if (root.querySelector('table>tbody>tr:nth-child(2)>td>center.Label3')) {
    numPages = 0;
    currentPage = 1;
    records = [];
  } else {
    const numRecordsEl = getElementFromDocument(
      root,
      '#navTable>tbody>tr:nth-child(1)>td.Label3',
      'number of records',
    );
    /**
     * String that contains the number of records.
     * For example: "Displaying 1 to 20 of 280 records."
     */
    const numRecordsString = numRecordsEl.innerText;
    const matches = numRecordsString.match(/Displaying (\d+) to (\d+) of (\d+) records\./i);
    if (matches && matches.length === 4) {
      const recordsPerPage = 20;
      numPages = Math.ceil(Number(matches[3]) / recordsPerPage);

      const currentPageEl = getElementFromDocument(
        root,
        '#navTable>tbody>tr:nth-child(2) .rptNavigationSelected',
        'current page',
      );
      currentPage = Number(currentPageEl.innerText);

      const table = getElementFromDocument(root, '#rprtDataTable', 'data table');
      records = parseTable({
        root: table,
        headers,
        recordSelector: 'tbody>tr.rprtDataTableGrandTotalRow,tbody>tr.TablerowBG1',
      });
    } else {
      // TODO: Consider making this a custom error
      throw new Error('Invalid record number string.');
    }
  }
  return {
    numPages,
    currentPage,
    records,
  };
}

/** The number of decimal places that numbers on the ZRA website have. */
const ZRA_DECIMAL_PLACES = 2;

/**
 * Scales a decimal value to remove the values after the decimal point.
 * @param {number} amount
 */
export function scaleZraAmount(amount) {
  return amount * (10 ** ZRA_DECIMAL_PLACES);
}

/**
 * Parses numbers from the ZRA website. The numbers contain commas and decimal places that must be
 * properly parsed.
 *
 * This doesn't return a float but rather an integer to prevent floating point errors. Thus, any
 * calculations using the return should take into account that the number is actually smaller.
 * To convert a number to be in the same scale as the return, use `scaleZraAmount`.
 * @param {string} amount E.g. 3,400.00
 * @returns {number} Amount scaled to remove values after decimal point. E.g. 3,401.75 -> 340175
 */
// TODO: Consider actually using this when parsing tables.
export function parseAmountString(amount) {
  // TODO: Remove this type check once we use TypeScript
  if (amount && typeof amount === 'string') {
    return scaleZraAmount(parseFloat(amount.replace(/,/g, '')));
  }
  return null;
}
