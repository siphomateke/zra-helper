import Papa from 'papaparse';
import textTable from 'text-table';
import store from '@/store';
// TODO: Give this file a better name

/**
 * @typedef {'\r\n'|'\n'} EolCharacter End of line character.
 */

/**
 * Gets the end of line character used by the current platform.
 * @returns {Promise.<EolCharacter>}
 */
export async function getPlatformEol() {
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
 * @param {string} str
 * @returns {string}
 */
export function correctEolChars(str) {
  const { eol } = store.state;
  if (eol !== '\n') {
    return str.replace(/\n/g, eol);
  }
  return str;
}

/**
 * Unparses JavaScript data objects and returns a CSV string
 * @param {any[][]|Object[]} data
 * @param {Papa.UnparseConfig} options
 */
export function unparseCsv(data, options = {}) {
  return Papa.unparse(data, Object.assign({
    quotes: true,
    newline: store.state.eol,
  }, options));
}

/**
 * Generates borderless text table strings suitable for printing to log.
 * @param {Array<Array<{}>>} rows
 * An array of arrays containing strings, numbers, or other printable values.
 * @returns {string}
 */
export function renderTable(rows) {
  const str = textTable(rows);
  return correctEolChars(str);
}

/**
 * Converts an array of objects to a CSV string.
 * @param {Object[]} data
 * @returns {string} The data as a CSV string
 */
// TODO: This function isn't really needed. Papaparse can already do this.
export function writeCsv(data) {
  if (data.length > 0) {
    const rows = data.map(row => Object.values(row));
    rows.unshift(Object.keys(data[0]));
    return unparseCsv(rows);
  }
  return '';
}

/**
 * Stringifies JSON
 * @param {Object} json
 * @returns {string}
 */
export function writeJson(json) {
  const str = JSON.stringify(json, null, 2);
  return correctEolChars(str);
}
