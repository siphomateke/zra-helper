import path from 'path';
import loadFileFromRootPath from '$tests/utils';

export function loadFile(filename) {
  return loadFileFromRootPath(path.join('../src/backend/client_actions/tax_payer_ledger/tests/samples', filename));
}

/**
 * @template {import('../logic').ParsedTaxPayerLedgerRecord} Record
 * @param {Record[]} records
 * @returns {string[]}
 */
export function recordsToSerialNumbers(records) {
  return records.map(r => r.srNo);
}
