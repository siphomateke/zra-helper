import moment from 'moment';
import parseNarration, { narrationGroups, narrationTypes } from './narration';
import { parseAmountString } from '@/backend/content_scripts/helpers/zra';
import { pendingLiabilityTypes } from '../pending_liabilities';
import { objectsEqual } from '@/utils';
import getDataFromReceipt from '@/backend/content_scripts/helpers/receipt_data';
import { generateAckReceiptRequest } from '../return_history/ack_receipt';
import { getAllReturnHistoryRecords } from '../return_history/base';
import { getDocumentByAjax } from '@/backend/utils';
import generateChangeReasonString from './reason_string';

/**
 * @typedef {import('@/backend/constants').Date} Date
 * @typedef {import('@/backend/constants').UnixDate} UnixDate
 * @typedef {import('./narration').ParsedNarrationType} ParsedNarrationType
 */

/** @typedef {string} LedgerSystemError */
/** @enum {LedgerSystemError} */
export const ledgerSystemErrors = {
  RETURN_ROUNDED_UP: 'RETURN_ROUNDED_UP',
  ADVANCE_PAYMENT: 'ADVANCE_PAYMENT', // FIXME: Describe this properly.
};

/**
* @typedef {Object} ParsedTaxPayerLedgerRecordTemp
* @property {ParsedNarrationType} narration
* @property {number} debit
* @property {number} credit
* @property {UnixDate} transactionDate
* @property {Date} transactionDateString
* @property {UnixDate} fromDate
* @property {Date} fromDateString
* @property {UnixDate} toDate
* @property {Date} toDateString
*/

/**
 * @typedef {import('@/backend/reports').TaxPayerLedgerRecord & ParsedTaxPayerLedgerRecordTemp} ParsedTaxPayerLedgerRecord
 */

/**
 * Parses a date from the tax payer ledger.
 * @param {string} date
 * @returns {number} UNIX time
 */
export function parseDate(date) {
  return moment(date, 'DD/MM/YYYY').valueOf();
}

/**
 * Converts records from the tax payer ledger to a machine-readable format.
 * @param {import('@/backend/reports').TaxPayerLedgerRecord[]} records
 * @returns {ParsedTaxPayerLedgerRecord[]}
 */
export function parseLedgerRecords(records) {
  /** @type {ParsedTaxPayerLedgerRecord[]} */
  const parsedRecords = [];
  for (const record of records) {
    const narration = parseNarration(record.narration.toLowerCase());
    const recordCopy = Object.assign({}, record);
    parsedRecords.push(Object.assign(recordCopy, {
      narration,
      debit: parseAmountString(record.debit),
      credit: parseAmountString(record.credit),
      transactionDate: parseDate(record.transactionDate),
      transactionDateString: record.transactionDate,
      fromDate: parseDate(record.fromDate),
      toDate: parseDate(record.toDate),
      fromDateString: record.fromDate,
      toDateString: record.toDate,
    }));
  }
  return parsedRecords;
}

/**
 * Checks if a record is the reversal of another record.
 * @param {ParsedTaxPayerLedgerRecord} record1
 * @param {ParsedTaxPayerLedgerRecord} record2
 * @returns {boolean}
 */
export function recordMatchesReversalRecord(record1, record2) {
  const typeMatches = record1.narration.type === record2.narration.type;
  if (!typeMatches) return false;
  const amountMatches = record1.debit === record2.credit && record1.credit === record2.debit;
  if (!amountMatches) return false;
  // TODO: Make sure this should always be true.
  const metaEqual = objectsEqual(record1.narration.meta, record2.narration.meta);
  if (!metaEqual) return false;
  return true;
}

/**
 * Finds the original record that the provided record is reversing.
 * @param {Map<string, ParsedTaxPayerLedgerRecord>} records
 * @param {ParsedTaxPayerLedgerRecord} reversalRecord
 * @returns {ParsedTaxPayerLedgerRecord | null}
 */
// TODO: Make this faster. Perhaps by sorting the records before-hand by type.
export function findOriginalRecordOfReversal(records, reversalRecord) {
  const serialNumbers = Array.from(records.keys());
  const reversalRecordIndex = serialNumbers.indexOf(reversalRecord.srNo);
  // Loop through all records that come before the reversal.
  for (let i = reversalRecordIndex - 1; i >= 0; i--) {
    const srNo = serialNumbers[i];
    const record = records.get(srNo);
    if (recordMatchesReversalRecord(record, reversalRecord)) {
      return record;
    }
  }
  return null;
}

/**
 * @typedef {Object.<string, ParsedTaxPayerLedgerRecord>} ClosingBalancesByPeriod
 */

/**
 * Extracts and groups closing balances by period.
 * @param {ParsedTaxPayerLedgerRecord[]} records
 * @returns {ClosingBalancesByPeriod}
 */
export function getClosingBalances(records) {
  const balancesByPeriod = {};
  for (const record of records) {
    if (record.narration.type === narrationTypes.CLOSING_BALANCE) {
      balancesByPeriod[record.fromDate] = record;
    }
  }
  return balancesByPeriod;
}

/**
 * Removes useless meta records such as closing balance.
 * @param {ParsedTaxPayerLedgerRecord[]} records
 * @returns {ParsedTaxPayerLedgerRecord[]}
 */
function removeMetaRecords(records) {
  return records.filter(record => record.narration.group !== narrationGroups.META);
}

/**
 * Sorts records by the provided date field.
 * @param {ParsedTaxPayerLedgerRecord[]} records
 * @param {'transactionDate' | 'fromDate' | 'toDate'} field
 * @param {boolean} [asc]
 * @returns {ParsedTaxPayerLedgerRecord[]}
 */
function sortRecordsByDate(records, field, asc = true) {
  if (asc) {
    return records.slice().sort((a, b) => a[field] - b[field]);
  }
  return records.slice().sort((a, b) => b[field] - a[field]);
}

/**
 *
 * @param {ParsedTaxPayerLedgerRecord[]} records
 * @returns {ParsedTaxPayerLedgerRecord[]}
 */
function sortRecordsBySerialNumber(records) {
  return records.slice().sort((a, b) => Number(a.srNo) - Number(b.srNo));
}

/**
 * Removes records that were later reversed.
 *
 * The records must be the sorted by transaction date with the latest one being the last item.
 * The records must be in the order they are retrieved from the ledger. That order has reversals
 * follow the item they reversed.
 * @param {ParsedTaxPayerLedgerRecord[]} records
 * @returns {ParsedTaxPayerLedgerRecord[]}
 */
// TODO: Examine map to array conversion performance impact.
export function removeReversals(records) {
  /** @type {Map<string, ParsedTaxPayerLedgerRecord>} */
  const recordsBySrNo = new Map();
  for (const record of records) {
    recordsBySrNo.set(record.srNo, record);
  }
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    // If this record is a reversal, find what was reversed and remove both records.
    if (record.narration.reversal) {
      /** The record that was reversed. */
      const originalRecord = findOriginalRecordOfReversal(recordsBySrNo, record);
      if (originalRecord) {
        recordsBySrNo.delete(record.srNo);
        recordsBySrNo.delete(originalRecord.srNo);
      }
    }
  }
  return Array.from(recordsBySrNo.values());
}

/**
 * Remove records that had zero credit and zero debit. This is often the case
 * when backdating original returns.
 * @param {ParsedTaxPayerLedgerRecord[]} records
 * @returns {ParsedTaxPayerLedgerRecord[]}
 */
// TODO: Add unit tests
function removeZeroRecords(records) {
  const nonZeroRecords = [];
  for (const record of records) {
    if (record.debit > 0 || record.credit > 0) {
      nonZeroRecords.push(record);
    }
  }
  return nonZeroRecords;
}

/**
 *
 * @param {ParsedTaxPayerLedgerRecord} record
 * @param {number} amount
 * @returns {boolean}
 */
function recordMatchesAmount(record, amount) {
  return record.debit === amount || record.credit === amount;
}

/**
 * Finds the record that caused a change in the pending liabilities.
 * @param {number} amount
 * @param {ParsedLedgerRecordWithReturnData[]} records
 * @returns {ParsedTaxPayerLedgerRecord}
 */
function findLedgerRecordByAmount(amount, records) {
  // TODO: Make sure the matched record has the correct narration type for the tax type and total
  // type (principal, interest)
  for (const record of records) {
    if (recordMatchesAmount(record, amount)) {
      return record;
    }
    if (record.returnData) {
      for (const payment of record.returnData.payments) {
        if (recordMatchesAmount(payment, amount)) {
          return payment;
        }
      }
    }
  }
  return null;
}

/**
 * Returns the difference between two dates in days.
 * @param {number} date1
 * @param {number} date2
 * @returns {number}
 */
function getDifferenceInDays(date1, date2) {
  return moment(date1).diff(date2, 'days');
}

/**
 * @typedef {Object} PastWeekRecordsResponse
 * @property {ParsedTaxPayerLedgerRecord[]} withinLastWeek
 * @property {ParsedTaxPayerLedgerRecord[]} exactlyAWeekAgo
 */

/**
 * Gets all transactions that took place in the past week.
 * @param {ParsedTaxPayerLedgerRecord[]} records
 * @param {number} currentDate
 * @returns {PastWeekRecordsResponse}
 */
export function getRecordsFromPastWeek(records, currentDate = new Date().valueOf()) {
  const sorted = sortRecordsByDate(records, 'transactionDate', false);
  const exactlyAWeekAgo = [];
  const withinLastWeek = [];
  for (const record of sorted) {
    const diff = getDifferenceInDays(currentDate, record.transactionDate);
    if (diff >= 0 && diff <= 7) {
      withinLastWeek.push(record);
      if (diff === 7) {
        exactlyAWeekAgo.push(record);
      }
    } else if (diff > 7) {
      break;
    }
  }
  return {
    withinLastWeek,
    exactlyAWeekAgo,
  };
}

/**
 * @typedef {Object} ReturnData
 * @property {number} index The index of the return in the records.
 * @property {ParsedTaxPayerLedgerRecord} record The return record.
 * @property {ParsedTaxPayerLedgerRecord[]} payments Payments that belong to the return.
 * @property {number} paymentsSum Sum of all the payments.
 * @property {boolean} paymentsMatchReturn
 * Whether the sum of the payments matches the return amount.
 * @property {ParsedTaxPayerLedgerRecord[]} advancePayments
 */

/**
 * @typedef {Object} ParsedLedgerRecordWithReturnData_Temp
 * @property {ReturnData} returnData
 */

/**
 * @typedef {ParsedTaxPayerLedgerRecord & ParsedLedgerRecordWithReturnData_Temp} ParsedLedgerRecordWithReturnData
 */

/**
 * Matches up payments to their returns in the tax payer ledger.
 *
 * This depends on original returns being followed by their payments.
 * Because of this, PAYE and WHT don't currently work as they have returns that are split in two.
 * Additionally, revised provisional returns may not work as expected.
 *
 * Note: The payments for the return can be split up into multiple returns and don't always add
 * up to the return.
 * @param {ParsedTaxPayerLedgerRecord[]} records
 * @returns {ParsedLedgerRecordWithReturnData[]} Return data by serial number.
 */
// TODO: Don't add record objects to other records, only serial numbers.
// TODO: Add unit tests. Particularly for amended returns.
export function matchPaymentsToReturns(records) {
  const recordsWithReturnData = [];
  /** Keep track of records that are related to returns so we don't add them twice. */
  const processedRecords = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const recordCopy = Object.assign({}, record);
    if (record.narration.group === narrationGroups.RETURNS) {
      processedRecords.push(record.srNo);
      const returnData = {
        index: i,
        record,
        payments: [],
        paymentsSum: 0,
        paymentsMatchReturn: false,
        advancePayments: [],
      };
      // Look for records that come after the return as they are probably associated with it.
      for (let j = i + 1; j < records.length; j++) {
        /** Record associated with the current return such as a payment or an amended return. */
        const subRecord = records[j];
        // If we have reached the next return in the ledger, then we have got all payments for
        // the current return.
        if (subRecord.narration.group === narrationGroups.RETURNS) {
          // Now check if the sum of all the payments is equal to the return amount.
          returnData.paymentsMatchReturn = returnData.paymentsSum === returnData.record.debit;
          break;
        } else if (subRecord.narration.type === narrationTypes.PAYMENT) {
          const payment = subRecord;
          // We can't double check that this payment belongs to the return as it might not be equal
          // to the return amount as payments can be split up. Additionally, even the multiple
          // payments might not add up to the total return amount.
          returnData.payments.push(payment);
          returnData.paymentsSum += payment.credit;
          processedRecords.push(payment.srNo);
        } else if (subRecord.narration.type === narrationTypes.ADVANCE_PAYMENT) {
          // We need to keep track of the advance payments made after the return to figure out
          // if there were any system errors.
          const advancePayment = subRecord;
          returnData.advancePayments.push(advancePayment);
          // Note that we don't mark the advance payment as processed as we still want it to be
          // treated as an independent record in case it caused the change in pending liabilities.
        }
      }
      recordsWithReturnData.push(Object.assign(recordCopy, {
        returnData,
      }));
    } else if (!processedRecords.includes(record.srNo)) {
      recordsWithReturnData.push(Object.assign(recordCopy, {
        returnData: null,
      }));
    }
  }
  return recordsWithReturnData;
}

/**
 * Checks if a closing balance is zero.
 *
 * It handles debit or credit being empty as well.
 * @param {ParsedTaxPayerLedgerRecord} record
 * @returns {boolean}
 */
// TODO: Test this
export function closingBalanceIsZero(record) {
  const debitZero = record.debit === 0 || record.debit === null;
  const creditZero = record.credit === 0 || record.credit === null;
  return debitZero && creditZero;
}

/**
 * @typedef {Object} GetLiabilityAmountFromAckReceiptFnOptions
 * @property {number} options.parentTaskId
 * @property {import('@/backend/constants').TPIN} options.tpin
 * @property {import('@/backend/constants').TaxTypeNumericalCode} options.taxTypeId
 * @property {ParsedTaxPayerLedgerRecord} options.record
 */

/**
 * Gets liability amounts from all acknowledgement receipts that match a provided record
 * from the ledger.
 *
 * Since more than one return can be filed on a particular day, there may be more than one possible
 * matching acknowledgement receipt and thus liability amounts.
 * @param {GetLiabilityAmountFromAckReceiptFnOptions} options
 * @returns {Promise<number[]>} The possible liability amounts.
 */
// TODO: Add tests
async function getLiabilityAmountFromAckReceipt({
  parentTaskId,
  tpin,
  taxTypeId,
  record,
}) {
  // TODO: Handle failed pages
  const { data: taxReturns } = await getAllReturnHistoryRecords({
    parentTaskId,
    tpin,
    taxTypeId,
    fromDate: record.fromDateString,
    toDate: record.toDateString,
  });
  const possibleAmounts = [];
  const documentPromises = [];
  for (const taxReturn of taxReturns) {
    const referenceNumber = taxReturn.referenceNo;
    if (taxReturn.returnAppliedDate === record.transactionDateString) {
      const requestOptions = generateAckReceiptRequest(taxTypeId, referenceNumber);
      documentPromises.push(getDocumentByAjax({
        ...requestOptions,
        method: 'post',
      }));
    }
  }
  const docs = await Promise.all(documentPromises);
  for (const doc of docs) {
    const data = getDataFromReceipt(doc, 'ack_return');
    const amount = parseAmountString(data.liabilityAmount);
    possibleAmounts.push(amount);
  }
  return possibleAmounts;
}

/**
 * @typedef {Object} ChangeReasonDetails
 * @property {UnixDate} fromDate
 * @property {UnixDate} toDate
 * @property {UnixDate} transactionDate
 * @property {LedgerSystemError} systemError
 * @property {ParsedNarrationType} narration
 * @property {string} [prn]
 * @property {string} [assessmentNumber]
 */

/**
 * Generates the details about why a change in pending liabilities happened based on a record.
 * @param {Object} options
 * @param {ParsedLedgerRecordWithReturnData} options.record
 * @param {number} options.difference
 * @param {string} options.pendingLiabilityType Pending liability type. E.g. 'principal', 'interest'
 * @param {ClosingBalancesByPeriod} options.closingBalances
 * @param {import('@/backend/constants').TaxTypeNumericalCode} options.taxTypeId
 * @param {import('@/backend/constants').Client} options.client
 * @param {number} options.parentTaskId
 * @returns {Promise.<ChangeReasonDetails>}
 */
async function generateChangeReasonDetails({
  record,
  difference,
  pendingLiabilityType,
  closingBalances,
  taxTypeId,
  client,
  parentTaskId,
}) {
  /** @type {ChangeReasonDetails} */
  const details = {
    fromDate: record.fromDate,
    toDate: record.toDate,
    transactionDate: record.transactionDate,
    narration: record.narration,
    systemError: null,
  };
  if (record.narration.group === narrationGroups.PAYMENTS) {
    details.prn = record.narration.meta.prn || record.narration.meta.refPrn;
  }
  // FIXME: Get PRN numbers of late payments, advance payments, and late returns from
  // payments in the same period.
  if (record.narration.group === narrationGroups.ASSESSMENTS) {
    details.assessmentNumber = record.narration.meta.assessmentNumber;
  } else if ('assessmentNumber' in record.narration.meta) {
    details.assessmentNumber = record.narration.meta.assessmentNumber;
  }
  // FIXME: Get assessment number when appropriate from assessments in the same period.
  // E.g. payments and penalties for amended assessments.

  // If pending liabilities increased from last week.
  if (difference > 0) {
    // If specifically principal increased by less than a kwacha
    if (pendingLiabilityType === 'principal' && difference < 1) {
      // In this case, the return has been rounded up but the payment is still exact and correct.
      // Double check that that is the case.
      // TODO: Add unit tests for this specific case
      if (
        !record.returnData.paymentsMatchReturn
        && Math.ceil(record.returnData.record.debit) === record.returnData.paymentsSum
      ) {
        // It's pretty likely this is the system error case but just to be absolutely sure, check
        // the acknowledgement of return receipt. It has the accurate return amount.
        const possibleLiabilityAmounts = await getLiabilityAmountFromAckReceipt({
          tpin: client.username,
          parentTaskId,
          taxTypeId,
          record,
        });
        if (possibleLiabilityAmounts.length === 1) {
          const liabilityAmount = possibleLiabilityAmounts[0];
          if (record.returnData.paymentsSum === liabilityAmount) {
            details.systemError = ledgerSystemErrors.RETURN_ROUNDED_UP;
          }
        } else {
          // TODO: Make a note that it's probably a system error but we can't confirm it.
        }
      }
    } else {
      // TODO: Confirm that this shouldn't run if principal increased by less than a Kwacha.
      // FIXME: Handle closing balance not existing. This shouldn't be the case but just in case.
      const closingBalance = closingBalances[record.fromDate];
      if (closingBalanceIsZero(closingBalance) && record.returnData.advancePayments.length > 0) {
        // TODO: Make sure this check works
        details.systemError = ledgerSystemErrors.ADVANCE_PAYMENT;
      }
    }
  }
  return details;
}

export default async function taxPayerLedgerLogic({
  taxTypeId,
  lastPendingLiabilityTotals,
  pendingLiabilityTotals,
  taxPayerLedgerRecords,
  currentDate = new Date().valueOf(), // FIXME: Remove this
  client,
  parentTaskId,
}) {
  let parsedLedgerRecords = parseLedgerRecords(taxPayerLedgerRecords);

  // Extract closing balances
  const closingBalances = getClosingBalances(parsedLedgerRecords);
  // and then remove them from the records.
  parsedLedgerRecords = removeMetaRecords(parsedLedgerRecords);
  parsedLedgerRecords = removeZeroRecords(parsedLedgerRecords);

  const pastWeekRecords = getRecordsFromPastWeek(parsedLedgerRecords, currentDate);
  parsedLedgerRecords = pastWeekRecords.withinLastWeek;

  // The ZRA website sorts by fromDate by default but since we sorted by transaction date we
  // have to restore the original order.
  parsedLedgerRecords = sortRecordsBySerialNumber(parsedLedgerRecords);
  // Remove any records that were later reversed
  parsedLedgerRecords = removeReversals(parsedLedgerRecords);

  const returnsData = matchPaymentsToReturns(parsedLedgerRecords);

  const changeReasonsByLiability = {};
  for (const pendingLiabilityType of pendingLiabilityTypes) {
    const allChangeReasonDetails = [];
    // FIXME: Make sure totals are not empty.
    const lastWeek = parseAmountString(lastPendingLiabilityTotals[pendingLiabilityType]);
    const thisWeek = parseAmountString(pendingLiabilityTotals[pendingLiabilityType]);
    const difference = thisWeek - lastWeek;
    if (Math.abs(difference) > 0) {
      /**
       * The records that caused a change in pending liabilities.
       * @type {ParsedLedgerRecordWithReturnData[]}
       */
      let changeRecords = [];
      // Start by looking for an exact match of the difference.
      const matchingRecord = findLedgerRecordByAmount(difference, returnsData);
      if (matchingRecord) {
        changeRecords.push(matchingRecord);
      } else {
        // If there are no records that exactly match the amount, then all the records from
        // the last week must add up to the amount instead.
        // FIXME: Make sure that's true. There are probably other records that aren't.
        changeRecords = returnsData;
      }

      // Confirm that the records add up to the difference
      let sum = 0;
      for (const record of changeRecords) {
        sum += record.debit - record.credit;
      }
      if (sum !== difference) {
        // Check if any transactions took place exactly 7 days ago.
        if (pastWeekRecords.exactlyAWeekAgo.length > 0) {
          // If some did, that could be why things don't add up.
          // TODO: Make note of this
        }
        // TODO: Make a note of this
      }

      const promises = [];
      for (const record of changeRecords) {
        promises.push(generateChangeReasonDetails({
          record,
          closingBalances,
          difference,
          pendingLiabilityType,
          taxTypeId,
          client,
          parentTaskId,
        }));
      }
      const changeReasonDetails = await Promise.all(promises);
      for (const details of changeReasonDetails) {
        allChangeReasonDetails.push(details);
      }
    } else {
      allChangeReasonDetails.push(null);
    }
    const changeReasons = [];
    for (const details of allChangeReasonDetails) {
      changeReasons.push(generateChangeReasonString(taxTypeId, details));
    }
    // FIXME: Merge similar change reasons compactly.
    // When the date and other meta data is the same, only the header is required from each.
    // E.g. "Late return,\nLate payment,\nLate payment"
    changeReasonsByLiability[pendingLiabilityType] = changeReasons.join('\n\n');
  }
  return changeReasonsByLiability;
}
