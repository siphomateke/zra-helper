import Papa from 'papaparse';
import textTable from 'text-table';
import store from '@/store';
// TODO: Give this file a better name

/**
 * Extracts a filenames extension.
 * @param {string} filename
 * @returns {string} The extension
 */
export function getExtension(filename) {
  const split = filename.split('.');
  return split[split.length - 1];
}

/**
 * Gets the contents of a file.
 * @param {File} file
 * @returns {Promise.<string>} The contents of the file.
 * @throws Will throw an error if the file fails to load
 */
export async function loadFile(file) {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    // TODO: Add file load progress
    fileReader.onload = async function onload(fileLoadedEvent) {
      const text = fileLoadedEvent.target.result;
      resolve(text);
    };
    fileReader.onerror = function onerror(event) {
      reject(new Error(event.target.error));
    };
    fileReader.readAsText(file, 'UTF-8');
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

class ObjectToCsvConverter {
  /**
   *
   * @param {Map.<string, string>} columns
   * Column IDs and labels.
   */
  constructor(columns) {
    /** @type {any[][]} */
    this.rows = [];
    /** @type {any[]} The current row. */
    this.row = [];
    /** @type {number} The current nesting level. */
    this.level = 0;
    this.columns = columns;
    this.columnKeys = Array.from(this.columns.keys());
    this.columnLabels = Array.from(this.columns.values());
  }

  convertRecursive(data, root = false) {
    if (
      data !== null
      && typeof data === 'object'
      && !Array.isArray(data)
    ) {
      if (!root) {
        this.level++;
      }
      for (const key of Object.keys(data)) {
        if (root) {
          this.row = [];
        }
        this.row[this.level] = key;
        this.convertRecursive(data[key]);
      }
      if (!root) {
        this.level--;
      }
    } else {
      const rowsToAdd = [];
      if (Array.isArray(data)) {
        // Get the columns based on the current nesting level.
        const currentColumnKeys = this.columnKeys.slice(this.level + 1, this.columnKeys.length);
        for (const obj of data) {
          if (typeof obj !== 'object' || Array.isArray(obj)) {
            throw new Error('Arrays in the data must be arrays of objects whose keys are columns');
          }
          // It is now assumed that `obj` is an object whose keys are column keys.
          const row = [];
          for (const columnKey of currentColumnKeys) {
            if (columnKey in obj) {
              row.push(obj[columnKey]);
            } else {
              row.push('');
            }
          }
          rowsToAdd.push(row);
        }
      } else {
        rowsToAdd.push([data]);
      }
      for (const row of rowsToAdd) {
        this.row.push(...row);
        this.rows.push(this.row);

        // Indent next row based on current nesting level
        this.row = [];
        while (this.row.length < this.level + 1) {
          this.row.push('');
        }
      }
    }
  }

  convert(obj) {
    this.convertRecursive(obj, true);
    return [this.columnLabels, ...this.rows];
  }
}

/**
 * Converts an object to a CSV compatible format. Array items become rows and each nesting level
 * is a new column.
 *
 * Any arrays should be objects whose keys match the column keys.
 * @example
 * const columns = new Map([
 *   ['client', 'Client'],
 *   ['taxType', 'Tax type'],
 *   ['status', 'Status'],
 * ]);
 * const data = {
 *   Bob: {
 *     ITX: [
 *       { status: 'Approved' },
 *       { status: 'In progress' },
 *     ],
 *   },
 * };
 * objectToCsvTable(data, columns)
 * // returns the following rows
 * [
 *   [ 'Client', 'Tax type', 'Status' ],
 *   [ 'Bob', 'ITX', 'Approved' ],
 *   [ '', '', 'In progress' ]
 * ]
 * @param {*} obj
 * @param {Map.<string, string>} columns
 * Map of column labels and their keys. The column keys should match the keys of objects in
 * arrays in `obj`.
 * @returns {any[][]}
 */
// TODO: Attempt to strictly type `obj` once we are using TypeScript
export function objectToCsvTable(obj, columns) {
  const converter = new ObjectToCsvConverter(columns);
  return converter.convert(obj);
}
