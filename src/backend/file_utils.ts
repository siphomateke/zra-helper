import Papa from 'papaparse';
// TODO: Give this file a better name

/**
 * Converts an array of objects to a CSV string.
 * @returns The data as a CSV string
 */
export function writeCsv(data: Object[]): string {
  if (data.length > 0) {
    const rows = data.map(row => Object.values(row));
    rows.unshift(Object.keys(data[0]));
    return Papa.unparse(rows, { quotes: true });
  }
  return '';
}

/**
 * Stringifies JSON
 */
export function writeJson(json: Object): string {
  return JSON.stringify(json, null, 2);
}
