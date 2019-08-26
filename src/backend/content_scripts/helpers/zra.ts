import { ZraError } from '../../errors';
import { getElementFromDocument, RootElement } from './elements';
import { RequiredBy } from '@/utils';

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

export interface ParsedTableLinkCell {
  innerText: string;
  onclick: string;
}

/**
 * Object representing a single row whose keys are column headers and whose values are the
 * corresponding cell values.
 */
export type ParsedTableRecord<H extends string, C = string> = {
  [key in H]: C;
};

export interface ParsedTable<H extends string, C> {
  /** Array of records */
  records: ParsedTableRecord<H, C>[];
  /** The current page */
  currentPage: number;
  /** The total number of pages */
  numPages: number;
}

interface ParseTableOptions<H extends string, P extends boolean> {
  /** Document to get records from */
  root: RootElement;
  headers: H[];
  /** Selector of a single table data row. This shouldn't match any header rows. */
  recordSelector: string;
  /**
   * Whether the `onclick` attribute of links should also be parsed. If set to true, cells with
   * links will be of type [ParsedTableLinkCell]{@link ParsedTableLinkCell}.
   */
  parseLinks?: P;
}

/**
 * @template H Headers
 * @template P Whether parseLinks is true
 */
export function parseTable<
  H extends string,
  P extends boolean
>(options: RequiredBy<ParseTableOptions<H, P>, 'parseLinks'>):
  ParsedTableRecord<H, P extends true ? ParsedTableLinkCell | string : string>[];
/** @template H Headers */
export function parseTable<H extends string>(options: ParseTableOptions<H, any>): ParsedTableRecord<H, string>[];
/**
 * Parses ZRA tables and returns the records.
 * @template H Headers
 */
// TODO: Allow specifying which columns to check for links.
export function parseTable<H extends string>({
  root,
  headers,
  recordSelector,
  parseLinks = false,
}: ParseTableOptions<H, boolean>): ParsedTableRecord<H, ParsedTableLinkCell | string>[] {
  type Record = ParsedTableRecord<H, ParsedTableLinkCell | string>;

  const records: Record[] = [];
  const recordElements = root.querySelectorAll(recordSelector);
  for (const recordElement of recordElements) {
    const row: Record = {} as Record;
    const columns = recordElement.querySelectorAll('td');
    for (let index = 0; index < columns.length; index++) {
      const column = columns[index];
      const innerText = column.innerText.trim();
      let value: string | ParsedTableLinkCell = innerText;
      if (parseLinks) {
        const link = column.querySelector('a');
        if (link) {
          const onclick = link.getAttribute('onclick');
          if (onclick) {
            value = {
              innerText,
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

interface ParseTableAdvancedOptions<H extends string, P extends boolean> extends ParseTableOptions<H, P> {
  /** Selector of the element that contains information about the table such as the current page. */
  tableInfoSelector: string;
  /** String that will exist when there are no records */
  noRecordsString?: string;
}

/**
 * @template H Headers
 * @template P Whether parseLinks is true
 */
export function parseTableAdvanced<
  H extends string,
  P extends boolean
>(options: RequiredBy<ParseTableAdvancedOptions<H, P>, 'parseLinks'>):
  Promise<ParsedTable<H, P extends true ? ParsedTableLinkCell | string : string>>;
/** @template H Headers */
export function parseTableAdvanced<H extends string>(options: ParseTableAdvancedOptions<H, any>): Promise<ParsedTable<H, string>>;
/**
 * Parses ZRA tables and returns the records, current page and number of pages.
 * @template H Headers
 */
// TODO: Find out why this is async
export async function parseTableAdvanced<H extends string>({
  root,
  headers,
  tableInfoSelector,
  recordSelector,
  noRecordsString = 'No Records Found',
  parseLinks = false,
}: ParseTableAdvancedOptions<H, boolean>): Promise<ParsedTable<H, ParsedTableLinkCell | string>> {
  const tableInfoElement = getElementFromDocument(root, tableInfoSelector, 'table info');
  const tableInfo = tableInfoElement.innerText;
  let currentPage = 1;
  let numPages = 0;
  let records: ParsedTableRecord<H, ParsedTableLinkCell | string>[] = [];
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

export interface ParsedReportTable<H extends string, C> extends ParsedTable<H, C> { }

interface ParseReportTableOptions<H extends string> {
  root: RootElement;
  headers: H[];
}

/**
 * Parses rslt report tables.
 * These are used by the pending liabilities and the tax payer ledger reports.
 * @template H Headers
 */
export async function parseReportTable<H extends string>({
  root,
  headers,
}: ParseReportTableOptions<H>): Promise<ParsedReportTable<H, string>> {
  let numPages: number;
  let currentPage: number;
  let records: ParsedTableRecord<H, string>[];
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
 * Divides an integer to get the original value of an amount that was sclaed using `scaleZraAmount`.
 * @param {number} amount
 */
export function unscaleZraAmount(amount) {
  return amount / (10 ** ZRA_DECIMAL_PLACES);
}

/**
 * Formats a scaled monetary amount for display to the user.
 * @param {number} amount
 */
export function formatZraAmount(amount) {
  return `K${unscaleZraAmount(amount)}`;
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
