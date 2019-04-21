import { ZraError } from '../../errors';
import { getElementFromDocument, RootElement } from './elements';

/**
 * Gets error message from page if it exists
 */
export function getZraError(document: HTMLDocument): ZraError | null {
  // eslint-disable-next-line max-len
  const errorTable = <HTMLElement | null>(
    document.querySelector(
      '#maincontainer>tbody>tr:nth-child(4)>td:nth-child(3)>form>div>table>tbody>tr>td>table',
    )
  );
  if (errorTable !== null) {
    const errorTableHeader = <HTMLElement | null>errorTable.querySelector('tbody>tr.tdborder>td');
    if (errorTableHeader !== null && errorTableHeader.innerText.includes('An Error has occurred')) {
      const error = <HTMLElement | null>errorTable.querySelector('tbody>tr:nth-child(2)>td');
      if (error !== null) {
        return new ZraError(`${errorTableHeader.innerText.trim()}. ${error.innerText}`, null, {
          error: error.innerText,
        });
      }
    }
  }
  return null;
}

interface ParsedTableLinkCell {
  innerText: string;
  onclick: string;
}

/**
 * Object representing a single row whose keys are column headers and whose values are the
 * corresponding cell values.
 */
export type ParsedTableRecord<C extends string> = { [key in C]: string | ParsedTableLinkCell };

export interface ParsedTable<C extends string> {
  /** Array of records */
  records: ParsedTableRecord<C>[];
  /** The current page */
  currentPage: number;
  /** The total number of pages */
  numPages: number;
}

interface ParseTableOptions<H extends string> {
  /** Document to get records from */
  root: RootElement;
  headers: H[];
  /** Selector of a single table data row. This shouldn't match any header rows. */
  recordSelector: string;
  /**
   * Whether the `onclick` attribute of links should also be parsed. If set to true, cells with links
   * will be of type [ParsedTableLinkCell]{@link ParsedTableLinkCell}.
   */
  parseLinks?: boolean;
}

/**
 * Parses ZRA tables and returns the records.
 */
// FIXME: Fix return value sometimes having links even when parseLinks is false.
export function parseTable<H extends string>({
  root,
  headers,
  recordSelector,
  parseLinks = false,
}: ParseTableOptions<H>): ParsedTableRecord<H>[] {
  const records: ParsedTableRecord<H>[] = [];
  const recordElements = root.querySelectorAll(recordSelector);
  for (const recordElement of recordElements) {
    // FIXME: TypeScript blank_object
    const row: ParsedTableRecord<H> = {};
    const columns = recordElement.querySelectorAll('td');
    for (let index = 0; index < columns.length; index++) {
      const column = columns[index];
      let value: string | ParsedTableLinkCell = column.innerText.trim();
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

interface ParseTableAdvancedOptions<H extends string> extends ParseTableOptions<H> {
  /** Selector of the element that contains information about the table such as the current page. */
  tableInfoSelector: string;
  /** String that will exist when there are no records */
  noRecordsString?: string;
}

/**
 * Parses ZRA tables and returns the records, current page and number of pages.
 */
export async function parseTableAdvanced<H extends string>({
  root,
  headers,
  tableInfoSelector,
  recordSelector,
  noRecordsString = 'No Records Found',
  parseLinks = false,
}: ParseTableAdvancedOptions<H>): Promise<ParsedTable<H>> {
  const tableInfoElement = getElementFromDocument(root, tableInfoSelector, 'table info');
  const tableInfo = tableInfoElement.innerText;
  let currentPage = 1;
  let numPages = 0;
  let records: ParsedTableRecord<H>[] = [];
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

export interface ParsedReportTable<H extends string> extends ParsedTable<H> {}

interface ParseReportTableOptions<H extends string> {
  root: RootElement;
  headers: H[];
}

/**
 * Parses rslt report tables.
 * These are used by the pending liabilities and the tax payer ledger reports.
 */
export async function parseReportTable<H extends string>({
  root,
  headers,
}: ParseReportTableOptions<H>): Promise<ParsedReportTable<H>> {
  let numPages: number;
  let currentPage: number;
  let records: ParsedTableRecord<H>[];
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
