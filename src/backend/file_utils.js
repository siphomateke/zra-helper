import Papa from 'papaparse';
import textTable from 'text-table';
import store from '@/store';
import log from '@/transitional/log';

/**
 * Extracts a filenames extension.
 *
 * @param {string} filename
 * @returns {string} The extension
 */
function getExtension(filename) {
  const split = filename.split('.');
  return split[split.length - 1];
}

/**
 * Loads and parses a CSV file.
 *
 * @param {File} file The CSV file to load.
 * @returns {Promise.<string>}
 * @throws Will throw an error if the file fails to load
 */
export function loadCsvFile(file) {
  return new Promise((resolve, reject) => {
    const ext = getExtension(file.name);
    if (ext === 'csv') {
      const fileReader = new FileReader();
      // TODO: Add file load progress
      fileReader.onload = async function onload(fileLoadedEvent) {
        const text = fileLoadedEvent.target.result;
        log.setCategory('loadCsvFile');
        log.log(`Successfully loaded CSV file "${file.name}"`);
        resolve(text);
      };
      fileReader.onerror = function onerror(event) {
        log.setCategory('loadCsvFile');
        log.showError(`Loading file "${file.name}" failed: ${event.target.error}`);
        reject(new Error(event.target.error));
      };
      log.setCategory('loadCsvFile');
      log.log(`Loading CSV file "${file.name}"`);
      fileReader.readAsText(file, 'UTF-8');
    } else {
      log.setCategory('loadCsvFile');
      log.showError(`Uploaded CSV file's extension must be '.csv' not '.${ext}'.`);
    }
  });
}

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
