import { getElementFromDocument } from './elements';
import { TableError } from '../../errors';

/**
 * @typedef {Object.<string, string>} ParsedTableRecord
 * Object representing a single row whose keys are column headers and whose values are the corresponding cell values.
 */

/**
 * @typedef ParsedTable
 * @property {ParsedTableRecord[]} records Array of records
 * @property {number} currentPage The current page
 * @property {number} numPages The total number of pages
 */

/**
 * Parses ZRA tables and returns the records, current page and number of pages.
 * @param {Object} options
 * @param {Document} options.doc Document to get elements from
 * @param {string[]} options.headers Column headers
 * @param {string} options.tableInfoSelector Selector of the element that contains information about the table such as the current page.
 * @param {string} options.recordSelector Selector of a single table row
 * @param {string} options.noRecordsString String that will exist when there are no records
 * @returns {Promise.<ParsedTable>}
 */
export function parseTable({doc, headers, tableInfoSelector, recordSelector, noRecordsString = 'No Records Found'}) {
    return new Promise((resolve, reject) => {
        const tableInfoElement = getElementFromDocument(doc, tableInfoSelector, 'table info');
        const tableInfo = tableInfoElement.innerText;
        if (!tableInfo.includes(noRecordsString)) {
            const [_, currentPage, numPages] = tableInfo.match(/Current Page : (\d+) \/ (\d+)/);
            const records = [];
            const recordElements = doc.querySelectorAll(recordSelector);
            for (const recordElement of recordElements) {
                const row = {};
                const columns = recordElement.querySelectorAll('td');
                Array.from(columns, (column, index) => {
                    row[headers[index]] = column.innerText.trim();
                });
                records.push(row);
            }
            resolve({
                records,
                currentPage: Number(currentPage),
                numPages: Number(numPages)
            });
            return;
        } else {
            reject(new TableError('No records found in table.', 'NoRecordsFound'));
        }
    });
}