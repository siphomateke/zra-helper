import Papa from 'papaparse';
import taxPayerLedgerLogic from '../logic';
import { loadFile } from './utils';
import loadLedgerOutputCsv from './ledger_output';

/**
 *
 * @param {string} filename
 * @param {boolean} hasHeaders
 * Whether the CSV has headers. If set to false, default headers will be used.
 * @returns {Promise.<import('@/backend/reports').TaxPayerLedgerRecord[]>}
 */
async function loadLedgerCsv(filename, hasHeaders = true) {
  const csv = await loadFile(filename);
  const records = Papa.parse(csv, {
    header: hasHeaders,
    skipEmptyLines: true,
  }).data;
  if (!hasHeaders) {
    const headers = ['srNo', 'transactionDate', 'fromDate', 'toDate', 'narration', 'debit', 'credit', 'cumulativeBalance'];
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const newRecord = {};
      for (let j = 0; j < headers.length; j++) {
        newRecord[headers[j]] = record[j];
      }
      records[i] = newRecord;
    }
  }
  return records;
}

async function fullLogicTest(testName, filename) {
  test(testName, async () => {
    /** @type {import('./ledger_output').LedgerOutput} */
    let output = null;
    /** @type {import('@/backend/reports').TaxPayerLedgerRecord[]} */
    let records = null;
    const csvPromises = [
      loadLedgerOutputCsv(`./${filename}_output.csv`).then((resolvedOutput) => { output = resolvedOutput; }),
      loadLedgerCsv(`./${filename}_ledger.csv`, false).then((resolvedRecords) => { records = resolvedRecords; }),
    ];
    await Promise.all(csvPromises);

    const promises = [];
    for (const taxTypeId of Object.keys(output.data)) {
      // FIXME: Figure out how to indicate which tax type is being tested
      const ledgerTaxTypeOutput = output.data[taxTypeId];
      promises.push(taxPayerLedgerLogic({
        taxTypeId,
        lastPendingLiabilityTotals: ledgerTaxTypeOutput.previousWeekLiabilities,
        pendingLiabilityTotals: ledgerTaxTypeOutput.currentWeekLiabilities,
        taxPayerLedgerRecords: records,
        currentDate: output.currentWeekEnding,
        parentTaskId: null,
        client: null, // FIXME: Mock whatever the client data is needed for
      }).then((reasons) => {
        expect(reasons.changeReasonsByLiability).toEqual(ledgerTaxTypeOutput.changeReasons);
      }));
    }
    await Promise.all(promises);
  });
}

describe('full ledger logic tests', async () => {
  const logicTests = [
    { filename: 'example1' },
    { filename: 'example2' },
    { filename: 'example3' },
    { filename: 'example4' },
    { filename: 'example5' },
  ];
  for (const logicTest of logicTests) {
    fullLogicTest(logicTest.filename, logicTest.filename);
  }
});
