import Papa from 'papaparse';
import moment from 'moment';
import { pendingLiabilityColumns, pendingLiabilityTypes } from '@/backend/client_actions/pending_liabilities';
import { taxTypeNumericalCodes } from '@/backend/constants';
import { loadFile } from './utils';

/**
 * Parses the ledger CSV output's that the extension generates.
 * @param {string} csv
 * @returns {string[][]}
 */
function parseLedgerOutputCsv(csv) {
  const rows = Papa.parse(csv, {
    header: false,
    skipEmptyLines: true,
  }).data;
  return rows;
}

/**
 * Gets pending liability data from the ledger output for either the current or past week
 * depending on the starting column.
 * @param {string[]} row
 * @param {number} firstCol The index of the first column of the pending liability data.
 * @returns {LedgerOutputLiabilities}
 */
function parseLedgerOutputLiabilities(row, firstCol) {
  const liabilities = {};
  for (let i = 0; i < pendingLiabilityColumns.length; i++) {
    const columnName = pendingLiabilityColumns[i];
    const amount = row[i + firstCol].replace(/^K/, '');
    liabilities[columnName] = amount;
  }
  return liabilities;
}

/**
 * Extracts change reasons from the leger output.
 * @param {string[]} row
 * @param {number} firstCol The index of the first column of change reason data.
 * @returns {LedgerOutputChangeReasons}
 */
function parseLedgerOutputChangeReasons(row, firstCol) {
  const reasonsForChange = {};
  for (let i = 0; i < pendingLiabilityTypes.length; i++) {
    const type = pendingLiabilityTypes[i];
    reasonsForChange[type] = row[i + firstCol];
  }
  return reasonsForChange;
}

/**
 * Parses dates from the ledger output that are in the format "Current week ending 01-01-13".
 * @param {string} dateString
 * @returns {import('@/backend/constants').UnixDate|null}
 */
function parseWeekEndingDate(dateString) {
  const match = dateString.match(/week ending (.+)/);
  if (match) {
    const date = match[1];
    return moment(date, 'DD-MM-YY').valueOf();
  }
  return null;
}

/**
 * @typedef {Object} LedgerOutputLiabilities
 * @property {string} principal
 * @property {string} interest
 * @property {string} penalty
 * @property {string} total
 *
 * @typedef {Object} LedgerOutputChangeReasons
 * @property {string} principal
 * @property {string} interest
 * @property {string} penalty
 *
 * @typedef {Object} LedgerTaxTypeOutput
 * @property {LedgerOutputLiabilities} previousWeekLiabilities
 * @property {LedgerOutputChangeReasons} changeReasons
 * @property {LedgerOutputLiabilities} currentWeekLiabilities
 *
 * @typedef {Object.<string, LedgerTaxTypeOutput>} LedgerTaxTypesOutput By numerical tax type ID.
 *
 * @typedef {Object} LedgerOutput
 * @property {import('@/backend/constants').UnixDate} currentWeekEnding
 * @property {import('@/backend/constants').UnixDate} previousWeekEnding
 * @property {LedgerTaxTypesOutput} data
 */

/**
 * Converts a ledger output CSV into a machine readable format.
 * @param {string[][]} rows
 * @returns {LedgerOutput}
 */
function parseLedgerOutput(rows) {
  // Remove header information
  const dataRows = rows.slice(2, rows.length);
  /** @type {LedgerTaxTypesOutput} */
  const taxTypeData = {};
  for (const row of dataRows) {
    const taxTypeId = taxTypeNumericalCodes[row[0]];
    const previousWeekLiabilities = parseLedgerOutputLiabilities(row, 1);
    const currentWeekLiabilities = parseLedgerOutputLiabilities(row, 10);
    const changeReasons = parseLedgerOutputChangeReasons(row, 6);

    let anyBlank = false;
    for (const liabilities of [previousWeekLiabilities, currentWeekLiabilities]) {
      for (const col of Object.keys(liabilities)) {
        if (!liabilities[col]) {
          anyBlank = true;
          break;
        }
      }
    }

    // Only add tax types with actual data. Those are the ones that are present on the client.
    if (!anyBlank) {
      taxTypeData[taxTypeId] = {
        previousWeekLiabilities,
        changeReasons,
        currentWeekLiabilities,
      };
    }
  }
  /** @type {LedgerOutput} */
  const ledgerOutput = {
    data: taxTypeData,
  };
  const previousWeekEnding = rows[0][1];
  if (previousWeekEnding) {
    ledgerOutput.previousWeekEnding = parseWeekEndingDate(previousWeekEnding);
  }
  const currentWeekEnding = rows[0][10];
  if (currentWeekEnding) {
    ledgerOutput.currentWeekEnding = parseWeekEndingDate(currentWeekEnding);
  }
  return ledgerOutput;
}

/**
 * Loads a ledger output CSV file and returns a machine readable version.
 * @param {string} filename
 * @returns {Promise<LedgerOutput>}
 */
export default async function loadLedgerOutputCsv(filename) {
  const csv = await loadFile(filename);
  const rows = parseLedgerOutputCsv(csv);
  return parseLedgerOutput(rows);
}
