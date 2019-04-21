import Papa from 'papaparse';
import textTable from 'text-table';
import store from '@/store';
// TODO: Give this file a better name

export type EolCharacter = '\r\n' | '\n';

/**
 * Gets the end of line character used by the current platform.
 */
export async function getPlatformEol(): Promise<EolCharacter> {
  const { os } = await browser.runtime.getPlatformInfo();
  switch (os) {
    case 'win':
      return '\r\n';
    default:
      return '\n';
  }
}

/**
 * Fixes incorrect end of line characters.
 */
export function correctEolChars(str: string): string {
  const { eol } = store.state;
  if (eol !== '\n') {
    return str.replace(/\n/g, eol);
  }
  return str;
}

/**
 * Unparses JavaScript data objects and returns a CSV string
 * @param data
 * @param options
 */
export function unparseCsv(data: any[][] | object[], options: Papa.UnparseConfig = {}) {
  return Papa.unparse(
    data,
    Object.assign(
      {
        quotes: true,
        newline: store.state.eol,
      },
      options,
    ),
  );
}

/**
 * Generates borderless text table strings suitable for printing to log.
 * @param rows
 * An array of arrays containing strings, numbers, or other printable values.
 */
export function renderTable(rows: Array<Array<{}>>): string {
  const str = textTable(rows);
  return correctEolChars(str);
}

/**
 * Converts an array of objects to a CSV string.
 * @returns The data as a CSV string
 */
// TODO: This function isn't really needed. Papaparse can already do this.
export function writeCsv(data: object[]): string {
  if (data.length > 0) {
    const rows = data.map(row => Object.values(row));
    rows.unshift(Object.keys(data[0]));
    return unparseCsv(rows);
  }
  return '';
}

/**
 * Stringifies JSON
 */
export function writeJson(json: object): string {
  const str = JSON.stringify(json, null, 2);
  return correctEolChars(str);
}
