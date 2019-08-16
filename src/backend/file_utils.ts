import Papa from 'papaparse';
import textTable from 'text-table';
import store from '@/store';
// TODO: Give this file a better name

/**
 * Extracts a filenames extension.
 * @returns The extension
 */
export function getExtension(filename: string): string {
  const split = filename.split('.');
  return split[split.length - 1];
}

/**
 * Gets the contents of a file.
 * @returns The contents of the file.
 * @throws Will throw an error if the file fails to load
 */
export async function loadFile(file: File): Promise<string> {
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

class ObjectToCsvConverter {
  rows: any[][] = [];

  /** The current row. */
  row: any[] = [];

  /** The current nesting level. */
  level: number = 0;

  columnKeys: string[];

  columnLabels: string[];

  /**
   *
   * @param columns Column IDs and labels.
   */
  constructor(public columns: Map<string, string>) {
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
 * @param columns
 * Map of column labels and their keys. The column keys should match the keys of objects in
 * arrays in `obj`.
 */
// TODO: TS: Improve so that `T` generic is a key of the columns Map
type RecursiveObj<T> = { [key: string]: RecursiveObj<T> | Array<T> };
export function objectToCsvTable<T>(obj: RecursiveObj<T>, columns: Map<string, string>): any[][] {
  const converter = new ObjectToCsvConverter(columns);
  return converter.convert(obj);
}
