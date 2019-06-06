import fs from 'fs';
import path from 'path';

/**
 * Promise version of `readFile`.
 * @param {string} filename
 * @returns {Promise<string>}
 */
export function loadFile(filename) {
  return new Promise((resolve, reject) => {
    fs.readFile(path.join(__dirname, './samples/', filename), { encoding: 'utf-8' }, (err, data) => {
      if (err) reject(err);
      resolve(data);
    });
  });
}

/**
 * @template {import('../logic').ParsedTaxPayerLedgerRecord} Record
 * @param {Record[]} records
 * @returns {string[]}
 */
export function recordsToSerialNumbers(records) {
  return records.map(r => r.srNo);
}
