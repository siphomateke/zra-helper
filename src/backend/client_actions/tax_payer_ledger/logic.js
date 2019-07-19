import moment from 'moment';
import parseNarration, { narrationGroups, narrationTypes } from './narration';
import { parseAmountString, scaleZraAmount } from '@/backend/content_scripts/helpers/zra';
import { pendingLiabilityTypes } from '../pending_liabilities';
import { objectsEqual, deepClone } from '@/utils';
import getDataFromReceipt from '@/backend/content_scripts/helpers/receipt_data';
import { getAckReceiptPostOptions } from '../return_history/ack_receipt';
import { getAllReturnHistoryRecords } from '../return_history/base';
import { getDocumentByAjax } from '@/backend/utils';
import generateChangeReasonString from './reason_string';
import {
  LedgerError,
  ClosingBalanceMissingError,
  MultipleExactDifferenceMatches,
  SumOfChangeRecordsNotEqualToDifference,
  ExactAckReceiptNotFound,
  NoChangeRecordsFoundError,
} from '@/backend/errors';
import { validateParsedLedgerRecords } from './record_validation';

/**
 * @typedef {import('@/backend/constants').Date} Date
 * @typedef {import('@/backend/constants').UnixDate} UnixDate
 * @typedef {import('./narration').ParsedNarrationType} ParsedNarrationType
 * @typedef {import('@/backend/reports').TaxPayerLedgerRecord} TaxPayerLedgerRecord
 * @typedef {import('./narration').NarrationType} NarrationType
 * @typedef {import('../pending_liabilities').PendingLiabilityType} PendingLiabilityType
 * @typedef {import('@/backend/errors').ExtendedError} ExtendedError
 * @typedef {import('../pending_liabilities').Totals} PendingLiabilityTotals
 * @typedef {import('@/backend/constants').Client} Client
 */

/**
 * Errors that occurred processing the ledger that the user should know about. They aren't errors
 * per-say but are more hints that the output may be incorrect.
 * @typedef {ExtendedError[]} ProcessingErrors
 */

/** @typedef {string} LedgerSystemError */
/** @enum {LedgerSystemError} */
export const ledgerSystemErrors = {
  RETURN_ROUNDED_UP: 'RETURN_ROUNDED_UP',
  UNALLOCATED_ADVANCE_PAYMENT: 'UNALLOCATED_ADVANCE_PAYMENT',
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
 * @typedef {TaxPayerLedgerRecord & ParsedTaxPayerLedgerRecordTemp} ParsedTaxPayerLedgerRecord
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
 * @param {TaxPayerLedgerRecord[]} records
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
 * Checks if two records are numerically opposite.
 * @template {TaxPayerLedgerRecord} Record
 * @param {Record} record1
 * @param {Record} record2
 * @returns {boolean}
 */
function recordsAreOpposites(record1, record2) {
  return record1.debit === record2.credit && record1.credit === record2.debit;
}

/**
 * Checks if a record is the reversal of another record.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record} record1
 * @param {Record} record2
 * @returns {boolean}
 */
export function recordMatchesReversalRecord(record1, record2) {
  return record1.narration.type === record2.narration.type
    && recordsAreOpposites(record1, record2)
    // TODO: Make sure reversal metadata is always equal to the original's.
    && objectsEqual(record1.narration.meta, record2.narration.meta);
}

/**
 * Finds the original record that the provided record is reversing.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {RecordsBySrNo<Record>} records Records stored by serial number.
 * @param {Record} reversalRecord
 * @returns {Record | null}
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
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @typedef {Object.<string, Record>} ClosingBalancesByPeriod
 */

/**
 * Extracts and groups closing balances by period.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record[]} records
 * @returns {ClosingBalancesByPeriod<Record>}
 */
export function getClosingBalances(records) {
  /** @type {ClosingBalancesByPeriod<Record>} */
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
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record[]} records
 * @returns {Record[]}
 */
function removeMetaRecords(records) {
  return records.filter(record => record.narration.group !== narrationGroups.META);
}

/**
 * Sorts records by the provided date field.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record[]} records
 * @param {'transactionDate' | 'fromDate' | 'toDate'} field
 * @param {boolean} [asc]
 * @returns {Record[]}
 */
function sortRecordsByDate(records, field, asc = true) {
  if (asc) {
    return records.slice().sort((a, b) => a[field] - b[field]);
  }
  return records.slice().sort((a, b) => b[field] - a[field]);
}

/**
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record[]} records
 * @returns {Record[]}
 */
function sortRecordsBySerialNumber(records) {
  return records.slice().sort((a, b) => Number(a.srNo) - Number(b.srNo));
}

/**
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @typedef {Map<string, Record>} RecordsBySrNo
 */

/**
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record[]} records
 * @returns {RecordsBySrNo<Record>}
 */
export function getRecordsBySerialNumber(records) {
  const recordsBySrNo = new Map();
  for (const record of records) {
    recordsBySrNo.set(record.srNo, record);
  }
  return recordsBySrNo;
}

/**
 * Removes records that were later reversed.
 *
 * The records must be the sorted by transaction date with the latest one being the last item.
 * The records must be in the order they are retrieved from the ledger. That order has reversals
 * follow the item they reversed.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record[]} records
 * @returns {Record[]}
 */
// TODO: Examine map to array conversion performance impact.
export function removeReversals(records) {
  const recordsBySrNo = getRecordsBySerialNumber(records);
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
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record[]} records
 * @returns {Record[]}
 */
export function removeZeroRecords(records) {
  const nonZeroRecords = [];
  for (const record of records) {
    if (record.debit > 0 || record.credit > 0) {
      nonZeroRecords.push(record);
    }
  }
  return nonZeroRecords;
}

/**
 * Checks if a record's debit or credit matches an amount.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record} record
 * @param {number} amount
 * @returns {boolean}
 */
function recordMatchesAmount(record, amount) {
  return record.debit === amount || record.credit === amount;
}

/**
 * Attempts to find a single ledger record that directly caused a change in pending liabilities.
 *
 * If there are multiple records whose amounts exactly equal the change, they will all be returned.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {number} amount
 * @param {Record[]} records
 * @returns {Record[]} Records that match the amount.
 */
function findLedgerRecordByAmount(amount, records) {
  return records.filter(record => recordMatchesAmount(record, amount));
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
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @typedef {Object} RecordsDateRangeResponse
 * @property {Record[]} withinDateRange
 * @property {Record[]} exactlyInRange
 * Records that were either exactly on the `olderDate` or the `newerDate`.
 */

/**
 * Gets all transactions that took place within the two dates specified.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record[]} records
 * @param {UnixDate} olderDate The older date
 * @param {UnixDate} newerDate The newer date
 * @returns {RecordsDateRangeResponse<Record>}
 */
export function getRecordsInDateRange(records, olderDate, newerDate) {
  const sorted = sortRecordsByDate(records, 'transactionDate', false);
  const exactlyInRange = [];
  const withinDateRange = [];
  for (const record of sorted) {
    const diff1 = getDifferenceInDays(record.transactionDate, olderDate);
    const diff2 = getDifferenceInDays(record.transactionDate, newerDate);
    if (diff1 >= 0 && diff2 <= 0) {
      withinDateRange.push(record);
      if (diff1 === 0 || diff2 === 0) {
        exactlyInRange.push(record);
      }
    } else if (diff1 < 0) {
      // Since records are sorted newest to oldest, once we reach one older than the old date, stop.
      break;
    }
  }
  return {
    withinDateRange,
    exactlyInRange,
  };
}

/**
 * Generates a unique period string from a record's 'from' and 'to' dates.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record} record
 */
function getRecordPeriod(record) {
  return `${record.fromDateString}-${record.toDateString}`;
}

/**
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @typedef {Object.<string, Record[]>} RecordsByPeriod
 */

/**
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record[]} records
 * @returns {Object.<string, Record[]>}
 */
function getRecordsByPeriod(records) {
  /** @type {Object.<string, Record[]>} */
  const recordsByPeriod = {};
  for (const record of records) {
    const period = getRecordPeriod(record);
    if (!(period in recordsByPeriod)) {
      recordsByPeriod[period] = [];
    }
    recordsByPeriod[period].push(record);
  }
  return recordsByPeriod;
}

/**
 * Gets records that are in the same period as the provided one.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record} record
 * @param {Object<string, Record[]>} recordsByPeriod
 * @returns {Record[]}
 */
function getRecordsInSamePeriod(record, recordsByPeriod) {
  return recordsByPeriod[getRecordPeriod(record)];
}

/**
 * @typedef {Object} PaymentRecordMatchInfo
 * @property {boolean} typeMatches Whether the narration type of the record matches the payment.
 * @property {boolean} amountMatches Whether the record is a numerical opposite of the payment.
 * @property {boolean} fullMatch
 * Whether both the narration type and amount of the record match the payment.
 */

/**
 * Checks if a payment is for a certain record.
 * @param {ParsedTaxPayerLedgerRecord} record
 * @param {ParsedTaxPayerLedgerRecord} payment
 * @returns {PaymentRecordMatchInfo}
 */
export function recordMatchesPayment(record, payment) {
  const { against } = payment.narration.meta;
  const t = narrationTypes;
  /** @type {Object.<string, NarrationType | (() => boolean)>} */
  const matchers = {
    'principal liability': () => {
      if (record.narration.group === narrationGroups.RETURNS) {
        // If provisional return, also check quarters match.
        // TODO: Add test for this
        if (
          record.narration.type === t.PROVISIONAL_RETURN
          || record.narration.type === t.REVISED_PROVISIONAL_RETURN
        ) {
          if (record.narration.meta.quarter === payment.narration.meta.quarter) {
            return true;
          }
          return false;
        }
        return true;
      }
      return false;
    },
    // FIXME: Make sure matching late payments to payments doesn't stop them from being linked to
    // assessments.
    interest: t.LATE_PAYMENT_INTEREST,
    'payment penalty': t.LATE_PAYMENT_PENALTY,
    'late return penalty': t.LATE_RETURN_PENALTY,
    'assessment liability': () => record.narration.group === narrationGroups.ASSESSMENTS,
    'assessment manual penalty': () => record.narration.group === narrationGroups.PENALTY_ASSESSMENTS,
  };
  let typeMatches = false;
  if (against in matchers) {
    const matcher = matchers[against];
    if (typeof matcher === 'function') {
      typeMatches = matcher();
    } else if (record.narration.type === matcher) {
      typeMatches = true;
    }
  }
  const amountMatches = recordsAreOpposites(record, payment);
  return {
    typeMatches,
    amountMatches,
    fullMatch: typeMatches && amountMatches,
  };
}

/**
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record} record
 * @returns {number}
 */
function getRecordBalance(record) {
  return record.debit - record.credit;
}

/**
 * @typedef {Object} PairedLedgerRecord_Temp
 * @property {string|null} paymentOf Serial number of record a payment is of.
 * @property {string[]} payments
 * @property {number} paymentsSum
 * @property {string[]} counterparts Serial numbers of records that numerically oppose this record.
 * @property {number} counterpartsSum
 * @property {string[]} advancePayments Serial numbers of advance payments that follow a return.
 * @property {number} advancePaymentsSum
 *
 * @typedef {ParsedTaxPayerLedgerRecord & PairedLedgerRecord_Temp} PairedLedgerRecord
 */

/**
 * Stores a record's numerically opposite record.
 *
 * Also, updates the sum of the main record's counterparts.
 * @param {PairedLedgerRecord} record
 * @param {PairedLedgerRecord} counterpart
 */
function addCounterpartRecord(record, counterpart) {
  record.counterparts.push(counterpart.srNo);
  record.counterpartsSum += getRecordBalance(counterpart);
}

/**
 * Links two numerically opposite records. This is done so we can check which records balance.
 * @param {PairedLedgerRecord} record1
 * @param {PairedLedgerRecord} record2
 */
function linkRecords(record1, record2) {
  addCounterpartRecord(record1, record2);
  addCounterpartRecord(record2, record1);
}

/**
 * Discovers and links related records. E.g. payments to returns.
 *
 * Doesn't currently work for WHT and PAYE since they have duplicate returns and payments.
 *
 * Note: This whole matcher won't work if there are records with the same amount and period and no
 * unique meta data, but that doesn't matter since if they are identical, whatever operation
 * needs one can use the other. However, if we need to use serial numbers in the future, it will
 * matter.
 * @param {ParsedTaxPayerLedgerRecord[]} records
 */
// TODO: Add extensive testing. Particularly for amended returns.
// TODO: Make sure this works for revised provisional returns
// FIXME: Make this handle WHT and PAYE, which have duplicate returns and payments
export function pairRecords(records) {
  /** @type {PairedLedgerRecord[]} */
  const pairedRecords = records.map(record => Object.assign({
    paymentOf: null,
    payments: [],
    paymentsSum: 0,
    counterparts: [],
    counterpartsSum: 0,
    advancePayments: [],
    advancePaymentsSum: 0,
  }, record));
  const recordsByPeriod = getRecordsByPeriod(pairedRecords);
  for (const record of pairedRecords) {
    const recordsInSamePeriod = getRecordsInSamePeriod(record, recordsByPeriod);
    const indexOfRecordInPeriodRecords = recordsInSamePeriod.indexOf(record);
    // If it's a payment, find out what it's on.
    if (
      // only get pair info for non-reversals
      !record.narration.reversal
      && (
        record.narration.type === narrationTypes.PAYMENT
        || record.narration.type === narrationTypes.ADVANCE_PAYMENT
      )
    ) {
      // Search records that come before this one
      for (let j = indexOfRecordInPeriodRecords - 1; j >= 0; j--) {
        const otherRecord = recordsInSamePeriod[j];
        if (record.narration.type === narrationTypes.PAYMENT) {
          const payment = record;
          const matchInfo = recordMatchesPayment(otherRecord, payment);
          if (matchInfo.typeMatches) {
            // We can't double check that this payment belongs to the record by checking if its
            // equal to the record because payments can be split up. Additionally, even the
            // split up payments might not add up to the total record amount due to rounding errors.

            // TODO: Do something when it's a full match. It usually isn't because of the above.

            let alreadyMatched = false;
            if (otherRecord.payments.length > 0) {
              // If the record already has payments, this payment might only coincidentally match
              // it. To make sure that's not the case, check if adding this payment would cause
              // the payment sum to exceed the record's amount.

              // This won't always work because if the first payment added was wrong, this
              // payment may be treated as wrong even if it's actually the correct one.
              // We could perhaps also check if the current paymentsSum is exactly equal to the
              // record's value when there is only one payment. In that situation, the existing
              // payment is probably correct.
              // TODO: Add better checks to prevent payments being added to the wrong record.

              const newSum = otherRecord.paymentsSum + payment.credit;
              if (newSum > otherRecord.debit) {
                alreadyMatched = true;
              }
            }
            if (!alreadyMatched) {
              payment.paymentOf = otherRecord.srNo;
              otherRecord.payments.push(payment.srNo);
              otherRecord.paymentsSum += payment.credit;

              linkRecords(payment, otherRecord);
              break;
            }
          }
        } else if (record.narration.type === narrationTypes.ADVANCE_PAYMENT) {
          // We need to keep track of the advance payments made to figure out if there were any
          // system errors. Sometimes, the ledger only balances because of the advance payments.
          // That is a system error.
          const advancePayment = record;
          // At the moment, advance payments apply to any return.
          // TODO: Confirm that they only apply to returns.
          if (otherRecord.narration.group === narrationGroups.RETURNS) {
            advancePayment.paymentOf = otherRecord.srNo;
            otherRecord.advancePayments.push(advancePayment.srNo);
            otherRecord.advancePaymentsSum += advancePayment.credit;
            // Don't add as counterpart since the advance payment isn't necessarily
            // required to balance the record.
            break;
          }
        }
      }
    }
    // TODO: Consider matching assessments to penalties and assessments to amended assessments.
    // If we do that, we will have to run this before removing zero records. It only works now
    // because payments would also be zero if their matching record was zero.
  }
  return pairedRecords;
}

/**
 * Checks if a record's amount is equal to the sum of its counterparts.
 *
 * Mainly useful when finding records that cancel each other out.
 * @param {PairedLedgerRecord} record
 * @returns {boolean}
 */
function recordIsBalanced(record) {
  return getRecordBalance(record) + record.counterpartsSum === 0;
}

/**
 * Removes all records that are numerically cancelled out by other records.
 * @param {PairedLedgerRecord[]} pairedRecords
 * @returns {PairedLedgerRecord[]}
 */
export function removeBalancedRecords(pairedRecords) {
  const recordsBySrNo = getRecordsBySerialNumber(pairedRecords);
  for (const record of pairedRecords) {
    // If a record is balanced, remove it and all its counterparts.
    // E.g. if a return is balanced by it's payments, remove the return and its payments.
    if (recordIsBalanced(record)) {
      recordsBySrNo.delete(record.srNo);
      record.counterparts.map(srNo => recordsBySrNo.delete(srNo));
    }
  }
  return Array.from(recordsBySrNo.values());
}

/**
 * Checks if a closing balance is zero.
 *
 * It handles debit or credit being empty as well.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record} record
 * @returns {boolean}
 */
export function closingBalanceIsZero(record) {
  const debitZero = record.debit === 0 || record.debit === null;
  const creditZero = record.credit === 0 || record.credit === null;
  return debitZero && creditZero;
}

/**
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @typedef {Object} GetLiabilityAmountFromAckReceiptFnOptions
 * @property {number} options.parentTaskId
 * @property {import('@/backend/constants').TPIN} options.tpin
 * @property {import('@/backend/constants').TaxTypeNumericalCode} options.taxTypeId
 * @property {Record} options.record
 */

/**
 * Gets liability amounts from all acknowledgement receipts that match a provided record
 * from the ledger.
 *
 * Note that since more than one return can be filed on a particular day, there may be more than
 * one possible matching acknowledgement receipt and thus liability amounts.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {GetLiabilityAmountFromAckReceiptFnOptions<Record>} options
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
      const requestOptions = getAckReceiptPostOptions(taxTypeId, referenceNumber);
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
 * Extracts a single metadata property from all records that belong to a certain narration group
 * and are in the same period as the provided record
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record} record Record who we are getting the meta data for. It's used to find records
 * in the same period as its.
 * @param {RecordsByPeriod<Record>} recordsByPeriod
 * @param {string} group The narration group to match.
 * @param {string} property The metadata property to extract from the matches.
 * @returns {any[]} The extracted metadata from each match.
 */
function extractMetaDataFromRecordsInSamePeriod(record, recordsByPeriod, group, property) {
  const recordsInSamePeriod = getRecordsInSamePeriod(record, recordsByPeriod);
  const possibleMatches = [];
  for (const record2 of recordsInSamePeriod) {
    if (record2.narration.group === group) {
      possibleMatches.push(record2.narration.meta[property]);
    }
  }
  return possibleMatches;
}

/**
 * Gets a record's possible assessment numbers based on assessments in the same period.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record} record
 * @param {RecordsByPeriod<Record>} recordsByPeriod
 * @returns {string[]} Possible assessment numbers.
 */
function getRecordAssessmentNumber(record, recordsByPeriod) {
  return extractMetaDataFromRecordsInSamePeriod(
    record, recordsByPeriod, narrationGroups.ASSESSMENTS, 'assessmentNumber',
  );
}

/**
 * Gets a record's possible payment receipt numbers based on based on payments in the same period.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record} record
 * @param {RecordsByPeriod<Record>} recordsByPeriod
 * @returns {string[]} Possible payment receipt numbers.
 */
function getRecordPrn(record, recordsByPeriod) {
  return extractMetaDataFromRecordsInSamePeriod(
    record, recordsByPeriod, narrationGroups.PAYMENTS, 'prn',
  );
}

/**
 * @typedef {Object} ChangeReasonDetails
 * @property {boolean} change Whether there was a change
 * @property {UnixDate} [fromDate]
 * @property {UnixDate} [toDate]
 * @property {UnixDate} [transactionDate]
 * @property {LedgerSystemError[]} [systemErrors]
 * @property {ParsedNarrationType} [narration]
 * @property {string|string[]} [prn]
 * @property {string|string[]} [assessmentNumber]
 * @property {number} [quarter]
 * @property {NarrationType} [paymentOf]
 * The narration type of the record that this payment is for.
 */

/**
 * Generates the details about why a change in pending liabilities happened based on a record.
 * @param {Object} options
 * @param {PairedLedgerRecord} options.record
 * @param {RecordsByPeriod<any>} options.recordsByPeriod
 * @param {RecordsBySrNo<PairedLedgerRecord>} options.recordsBySrNo
 * @returns {ChangeReasonDetails}
 */
function generateChangeReasonDetails({
  record,
  recordsByPeriod,
  recordsBySrNo,
}) {
  /** @type {ChangeReasonDetails} */
  const details = {
    change: true,
    fromDate: record.fromDate,
    toDate: record.toDate,
    transactionDate: record.transactionDate,
    narration: record.narration,
    systemErrors: [],
  };

  if (record.narration.group === narrationGroups.PAYMENTS) {
    details.prn = record.narration.meta.prn || record.narration.meta.refPrn;
  } else if ([
    narrationTypes.LATE_PAYMENT_INTEREST,
    narrationTypes.LATE_PAYMENT_PENALTY,
  ].includes(record.narration.type)) {
    // TODO: Test getting PRN from payment in same period.
    details.prn = getRecordPrn(record, recordsByPeriod);
  }

  let paymentOfRecord = null;

  // TODO: Remove this first block since the outcome is a duplicate of the second one
  if (record.narration.group === narrationGroups.ASSESSMENTS) {
    details.assessmentNumber = record.narration.meta.assessmentNumber;
  } else if ('assessmentNumber' in record.narration.meta) {
    // First, try getting assessment number from narration
    details.assessmentNumber = record.narration.meta.assessmentNumber;
  } else if (
    // If that fails, get it from an assessment in the same period
    record.narration.type === narrationTypes.PENALTY_FOR_AMENDED_ASSESSMENT
    || record.narration.type === narrationTypes.LATE_PAYMENT_INTEREST
    || record.narration.type === narrationTypes.LATE_PAYMENT_PENALTY
  ) {
    // TODO: Test getting assessment number from assessment in same period.
    details.assessmentNumber = getRecordAssessmentNumber(record, recordsByPeriod);
  } else if (record.narration.type === narrationTypes.PAYMENT) {
    // If the record is a payment of a record that has an assessment number, use that record's
    // assessment number.
    paymentOfRecord = recordsBySrNo.get(record.paymentOf);
    if (paymentOfRecord && paymentOfRecord.narration.meta.assessmentNumber) {
      details.assessmentNumber = paymentOfRecord.narration.meta.assessmentNumber;
    }
  }

  if ('quarter' in record.narration.meta) {
    details.quarter = record.narration.meta.quarter;
  }

  if (record.narration.type === narrationTypes.PAYMENT) {
    if (record.paymentOf) {
      if (!paymentOfRecord) {
        paymentOfRecord = recordsBySrNo.get(record.paymentOf);
      }
      if (paymentOfRecord) {
        details.paymentOf = paymentOfRecord.narration.type;
      }
    }
  }

  return details;
}

/**
 * @typedef GetReturnSystemErrorsFnResponse
 * @property {LedgerSystemError[]} systemErrors
 * @property {ProcessingErrors} processingErrors
 */

/**
 * Checks if a return has any system errors. I.e. errors on ZRA's part.
 * @param {Object} options
 * @param {PairedLedgerRecord} options.record The return as a record
 * @param {ClosingBalancesByPeriod<any>} options.closingBalances
 * @param {number} options.difference The change in pending liabilities.
 * @param {import('@/backend/constants').TaxTypeNumericalCode} options.taxTypeId
 * @param {PendingLiabilityType} options.liabilityType
 * @param {Client} options.client
 * @param {number} options.parentTaskId
 * @returns {Promise<GetReturnSystemErrorsFnResponse>}
 */
async function getReturnSystemErrors({
  record,
  closingBalances,
  difference,
  taxTypeId,
  liabilityType,
  client,
  parentTaskId,
}) {
  /** @type {ProcessingErrors} */
  const processingErrors = [];
  /** @type {LedgerSystemError[]} */
  const systemErrors = [];

  // If pending liabilities increased since last time
  if (difference > 0) {
    // If specifically principal increased by less than a kwacha
    if (liabilityType === 'principal' && difference < scaleZraAmount(1)) {
      // In this case, the return has been rounded up but the payment is still exact and correct.
      // Double check that that is the case.
      // TODO: Add unit tests for this specific case
      if (Math.ceil(record.debit) === record.paymentsSum) {
        // It's pretty likely this is the system error case but just to be absolutely sure, check
        // the acknowledgement of return receipt. It has the accurate return amount.
        // TODO: Add tests to make sure provisional return receipts are found
        const possibleLiabilityAmounts = await getLiabilityAmountFromAckReceipt({
          tpin: client.username,
          parentTaskId,
          taxTypeId,
          record,
        });
        // TODO: Store how sure we are that it's a system error. If there is only one possible
        // pending liability amount, we are pretty sure. If there is more than one but one matches
        // the paymentSum, we are less sure.
        if (possibleLiabilityAmounts.length === 1) {
          const liabilityAmount = possibleLiabilityAmounts[0];
          if (record.paymentsSum === liabilityAmount) {
            systemErrors.push(ledgerSystemErrors.RETURN_ROUNDED_UP);
          }
        } else {
          let foundAmountMatch = false;
          for (const liabilityAmount of possibleLiabilityAmounts) {
            if (record.paymentsSum === liabilityAmount) {
              systemErrors.push(ledgerSystemErrors.RETURN_ROUNDED_UP);
              foundAmountMatch = true;
              break;
            }
          }
          let errorMessage = `When confirming if the return record '${record.srNo}' was incorrectly rounded up, multiple matching acknowledgement receipts were found. `;
          if (foundAmountMatch) {
            errorMessage += 'Since one of the receipts\' amounts did match the return\'s, it\'s pretty likely the return was incorrectly rounded up.';
          } else {
            errorMessage += 'None of them had an amount that matched the return and so whether it was incorrectly rounded up could not be confirmed.';
          }
          processingErrors.push(new ExactAckReceiptNotFound(
            errorMessage,
            null,
            {
              record: deepClone(record),
              foundAmountMatch,
            },
          ));
        }
      }
    }
    if (record.fromDate in closingBalances) {
      const closingBalance = closingBalances[record.fromDate];
      // Note: No need to make sure advance payments are greater than zero and thus contributed to
      // the closing balance because zero records will have already been removed.
      if (closingBalanceIsZero(closingBalance) && record.advancePayments.length > 0) {
        // TODO: Make sure this check works
        systemErrors.push(ledgerSystemErrors.UNALLOCATED_ADVANCE_PAYMENT);
      }
    } else {
      processingErrors.push(new ClosingBalanceMissingError(
        `A closing balance in the same period as return record '${record.srNo}' could not be found.`,
        null,
        {
          record: deepClone(record),
        },
      ));
    }
  }
  return {
    systemErrors,
    processingErrors,
  };
}

/**
 * @typedef {Object} ReasonStringRecord
 * @property {PairedLedgerRecord} record
 * @property {LedgerSystemError[]} systemErrors
 */

/**
 * Records and any corresponding system errors that should both be used to generate reason strings.
 * They are stored by records serial number.
 * @typedef {Map<string, ReasonStringRecord>} ReasonStringRecordMap
 */

/**
 * @typedef {Object} GetReasonStringRecordsFnResponse
 * @property {ReasonStringRecordMap} reasonStringRecords
 * @property {ProcessingErrors} processingErrors
 */

/**
 * Gets the records that should be used to actually generate the final reason strings output.
 * @param {Object} options
 * @param {PairedLedgerRecord[]} options.records
 * All the records that could have caused a change in pending liabilities.
 * @param {RecordsBySrNo<PairedLedgerRecord>} options.recordsBySrNo
 * @param {ClosingBalancesByPeriod<any>} options.closingBalances
 * @param {number} options.difference The change in pending liabilities.
 * @param {import('@/backend/constants').TaxTypeNumericalCode} options.taxTypeId
 * @param {PendingLiabilityType} options.liabilityType
 * @param {Client} options.client
 * @param {number} options.parentTaskId
 * @returns {Promise<GetReasonStringRecordsFnResponse>}
 */
// TODO: Add tests to make sure payments are added if there returns don't have system errors
async function getReasonStringRecords({
  records,
  recordsBySrNo,
  closingBalances,
  difference,
  taxTypeId,
  liabilityType,
  client,
  parentTaskId,
}) {
  /** @type {ProcessingErrors} */
  const processingErrors = [];
  /** @type {ReasonStringRecordMap} */
  const reasonStringRecords = new Map();
  for (const record of records) {
    /**
     * The return that this payment is of, if this record is a payment or the this record itself if
     * its a return. Returns need to be checked for common system errors.
     * @type {PairedLedgerRecord | null}
     */
    let returnRecord = null;
    // If this record is a payment, it may have a corresponding return that needs to be checked
    // for system errors
    if (
      record.narration.group === narrationGroups.PAYMENTS
      && recordsBySrNo.has(record.paymentOf)
    ) {
      /** The payment's corresponding return */
      const paymentsReturn = recordsBySrNo.get(record.paymentOf);
      if (paymentsReturn.narration.group === narrationGroups.RETURNS) {
        returnRecord = paymentsReturn;
      }
    } else if (record.narration.group === narrationGroups.RETURNS) {
      // If this record is a return, check it for system errors.
      returnRecord = record;
    }
    // If we already established the return to have any system errors, don't check it again or add
    // any records.
    // TODO: Add unit test to make sure this works
    if (
      returnRecord !== null
      && reasonStringRecords.has(returnRecord.srNo)
      && reasonStringRecords.get(returnRecord.srNo).systemErrors.length > 0
    ) {
      break;
    }

    /**
     * New records and their system errors to use to generate reason strings.
     * @type {ReasonStringRecord[]}
     */
    let reasonStringRecordsToAdd = [
      {
        record,
        systemErrors: [],
      },
    ];

    if (returnRecord !== null) {
      // We must process the records sequentially so we don't re-compute system errors for the
      // same record twice.
      // eslint-disable-next-line no-await-in-loop
      const response = await getReturnSystemErrors({
        record: returnRecord,
        closingBalances,
        difference,
        taxTypeId,
        liabilityType,
        client,
        parentTaskId,
      });
      processingErrors.push(...response.processingErrors);

      const { systemErrors } = response;
      if (systemErrors.length > 0) {
        // Remove original record. E.g. if it was a payment, we will only need the return.
        reasonStringRecordsToAdd = [];

        // If the system error was that an advance payment was not properly allocated to a return,
        // we will use the very same advance payment to generate a reason string.
        if (systemErrors.includes(ledgerSystemErrors.UNALLOCATED_ADVANCE_PAYMENT)) {
          for (const advancePaymentSrNo of returnRecord.advancePayments) {
            const advancePayment = recordsBySrNo.get(advancePaymentSrNo);
            reasonStringRecordsToAdd.push({
              record: advancePayment,
              systemErrors: [ledgerSystemErrors.UNALLOCATED_ADVANCE_PAYMENT],
            });
          }
        }
        // If the system error was that a return was rounded up and didn't match its payments,
        // we will use the return not the payments to generate a reason string.
        if (systemErrors.includes(ledgerSystemErrors.RETURN_ROUNDED_UP)) {
          reasonStringRecordsToAdd.push({
            record: returnRecord,
            systemErrors: [ledgerSystemErrors.RETURN_ROUNDED_UP],
          });
        }
      }
    }
    for (const item of reasonStringRecordsToAdd) {
      // Make sure not to add it twice. Otherwise, this might happen if, for example, there are
      // multiple payments for a return that was rounded up. Each payment will find their source
      // return (which will be the same one) and the return will be added multiple times.
      if (!reasonStringRecords.has(item.record.srNo)) {
        reasonStringRecords.set(item.record.srNo, {
          record: item.record,
          systemErrors: item.systemErrors,
        });
      }
    }
  }

  return {
    processingErrors,
    reasonStringRecords,
  };
}

/**
 * Checks if two change details are equal.
 * @param {ChangeReasonDetails} details1
 * @param {ChangeReasonDetails} details2
 * @returns {boolean}
 */
function changeDetailsEqual(details1, details2) {
  return objectsEqual(details1, details2);
}

/**
 * Removes duplicate change reason details. These are usually caused by records in the ledger being
 * split for no apparent reason.
 * @param {ChangeReasonDetails[]} changeReasonDetails
 * @returns {ChangeReasonDetails[]}
 */
// TODO: Add test for this
function removeDuplicateChangeReasonDetails(changeReasonDetails) {
  const list = changeReasonDetails.slice();
  for (let i = list.length - 1; i >= 0; i--) {
    const details = list[i];
    if (details.change) {
      for (let j = i - 1; j >= 0; j--) {
        const details2 = list[j];
        if (details2.change && changeDetailsEqual(details, details2)) {
          list.splice(i, 1);
          break;
        }
      }
    }
  }
  return list;
}

/**
 * Checks if a record contributes to a change in a certain liability type.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record} record
 * @param {PendingLiabilityType} liabilityType
 * @returns {boolean}
 */
function recordAffectsLiabilityType(record, liabilityType) {
  const isInterest = record.narration.group === narrationGroups.INTEREST
    || (
      record.narration.type === narrationTypes.PAYMENT
      && record.narration.meta.against === 'interest'
    );
  const isPenalty = record.narration.group === narrationGroups.PENALTIES
    || (
      record.narration.type === narrationTypes.PAYMENT
      && ['late return penalty', 'payment penalty'].includes(record.narration.meta.against)
    );
  if (liabilityType === 'interest') {
    return isInterest;
  } if (liabilityType === 'penalty') {
    return isPenalty;
  } if (liabilityType === 'principal') {
    return !isInterest && !isPenalty;
  }
  throw new Error('Unknown liability type');
}

/**
 * Filters out all records that don't cause a change in the provided liability type.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record[]} records
 * @param {PendingLiabilityType} liabilityType
 * @returns {Record[]}
 */
function filterRecordsByLiabilityType(records, liabilityType) {
  return records.filter(record => recordAffectsLiabilityType(record, liabilityType));
}

/**
 * Filters out all records that don't affect pending liabilities.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record[]} records
 * @returns {Record[]}
 */
function getRecordsThatAffectLiabilities(records) {
  return records.filter(r => r.narration.type !== narrationTypes.ADVANCE_PAYMENT);
}

/**
 * Gets unbalanced records from records that were sorted by transaction date.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record[]} recordsInDateRange
 * @returns The unbalanced records.
 */
function getUnbalancedRecordsInDateRange(recordsInDateRange) {
  let records = recordsInDateRange;
  // The ZRA website already sorts by fromDate by default but since we sorted by transaction date
  // we have to restore the original order.
  records = sortRecordsBySerialNumber(records);
  records = removeReversals(records);
  const pairedRecords = pairRecords(records);
  return removeBalancedRecords(pairedRecords);
}

/**
 * Figures out what all the records match up with. Primarily finds out payments returns.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record[]} parsedLedgerRecords
 * @returns {PairedLedgerRecord[]}
 */
function getAllPairedRecords(parsedLedgerRecords) {
  // Note: We don't remove reversals since we will use the paired records to get information about
  // change records (which can include non-reversed records since they are in a certain date range).
  return pairRecords(parsedLedgerRecords);
}

/**
 * @typedef {Object.<string, string>} ChangeReasonsByLiability
 */

/**
 * @typedef {Object} TaxPayerLedgerLogicFnResponse
 * @property {ChangeReasonsByLiability} changeReasonsByLiability
 * @property {ProcessingErrors} processingErrors
 * @property {import('./record_validation').ParsedRecordValidation[]} invalidRecords
 * @property {TaxPayerLedgerRecord[]} taxPayerLedgerRecords
 * @property {boolean} anyErrors Whether anything went wrong when looking for change reasons
 */

/**
 * Processes records from the tax payer ledger to determine why pending liabilities between two
 * dates.
 * @param {Object} options
 * @param {import('@/backend/constants').TaxTypeNumericalCode} options.taxTypeId
 * @param {PendingLiabilityTotals} options.previousPendingLiabilityTotals
 * Pending liability grand totals from a date older than `currentPendingLiabilityTotals`.
 * @param {PendingLiabilityTotals} options.currentPendingLiabilityTotals
 * Pending liability grand totals from a date newer than `previousPendingLiabilityTotals`.
 * @param {UnixDate} [options.previousDate]
 * The previous date. Should match when `previousPendingLiabilityTotals` were retrieved.
 * @param {UnixDate} [options.currentDate]
 * The current date. Should match when `currentPendingLiabilityTotals` were retrieved.
 * @param {TaxPayerLedgerRecord[]} options.taxPayerLedgerRecords
 * All records in the tax payer ledger.
 * @param {Client} options.client
 * @param {number} options.parentTaskId
 * @returns {Promise<TaxPayerLedgerLogicFnResponse>}
 */
export default async function taxPayerLedgerLogic({
  taxTypeId,
  previousPendingLiabilityTotals,
  currentPendingLiabilityTotals,
  previousDate,
  currentDate,
  taxPayerLedgerRecords,
  client,
  parentTaskId,
}) {
  /** @type {ProcessingErrors} */
  // FIXME: Actually output/use these errors
  const processingErrors = [];
  let parsedLedgerRecords = await parseLedgerRecords(taxPayerLedgerRecords);
  const validatedRecords = await validateParsedLedgerRecords(parsedLedgerRecords);
  const invalidRecords = validatedRecords.filter(r => !r.valid);

  // Extract closing balances
  const closingBalances = getClosingBalances(parsedLedgerRecords);
  // and then remove them from the records.
  parsedLedgerRecords = removeMetaRecords(parsedLedgerRecords);
  // Note: It's OK to do this before removing reversals because the reversals will also be zero.
  parsedLedgerRecords = removeZeroRecords(parsedLedgerRecords);

  // Find all the unbalanced records within the date range (usually the last week).
  const recordsInDateRange = getRecordsInDateRange(parsedLedgerRecords, previousDate, currentDate);
  const unbalancedRecords = getUnbalancedRecordsInDateRange(recordsInDateRange.withinDateRange);
  const allPotentialChangeRecords = getRecordsThatAffectLiabilities(unbalancedRecords);

  // Match records to what they are related to.
  const pairedRecords = getAllPairedRecords(parsedLedgerRecords);
  const pairedRecordsBySrNo = getRecordsBySerialNumber(pairedRecords);
  const pairedRecordsByPeriod = getRecordsByPeriod(pairedRecords);

  /** @type {ChangeReasonsByLiability} */
  const changeReasonsByLiability = {};
  const liabilityPromises = pendingLiabilityTypes.map(liabilityType => (async () => {
    /** @type {ChangeReasonDetails[]} */
    let changeReasonDetails = [];
    const lastTotal = parseAmountString(previousPendingLiabilityTotals[liabilityType]);
    const currentTotal = parseAmountString(currentPendingLiabilityTotals[liabilityType]);
    if (lastTotal === null || currentTotal === null) {
      throw new LedgerError('Invalid pending liability totals', 'InvalidTotals');
    }
    const difference = currentTotal - lastTotal;
    if (Math.abs(difference) > 0) {
      // TODO: Test this. `example1_output.csv` is a good sample.
      /** Records that could have contributed to the current pending liability type changing. */
      const potentialChangeRecords = filterRecordsByLiabilityType(
        allPotentialChangeRecords,
        liabilityType,
      );

      /**
       * The records that caused a change in pending liabilities.
       * @type {PairedLedgerRecord[]}
       */
      let changeRecords = [];
      // Start by looking for an exact match of the difference.
      const matchingRecords = findLedgerRecordByAmount(difference, potentialChangeRecords);
      if (matchingRecords.length === 1) {
        changeRecords.push(matchingRecords[0]);
      } else {
        // There shouldn't ever be more than one record that exactly matches the difference.
        // However, if there is, show a warning.
        if (matchingRecords.length > 1) {
          processingErrors.push(new MultipleExactDifferenceMatches(
            'Multiple records that exactly match the change in pending liabilities were found. Probably a system error.',
            null,
            {
              matchingRecords: deepClone(matchingRecords),
            },
          ));
        }

        // If there is no single record that exactly matches the amount, then any of the unbalanced
        // records from within the date range could have contributed to the change.
        changeRecords = potentialChangeRecords;
      }

      // TODO: Consider not including records in changeRecords that were already used for other
      // pending liability types to increase performance.

      // Confirm that the records add up to the difference
      let changeRecordsSum = 0;
      for (const record of changeRecords) {
        changeRecordsSum += getRecordBalance(record);
      }
      if (changeRecordsSum !== difference) {
        let errorMessage = 'The sum of the records determined to have caused a change in pending liabilities doesn\'t match the actual change in pending liabilities.';
        // Check if any transactions took place either on the `previousDate` or the `currentDate`.
        let exactlyInDateRangeSrNos = [];
        if (recordsInDateRange.exactlyInRange.length > 0) {
          // If some did, that could be why things don't add up.
          exactlyInDateRangeSrNos = recordsInDateRange.exactlyInRange.map(r => r.srNo);
          errorMessage += ` The following records took place on the previous date or current date [${exactlyInDateRangeSrNos.join(',')}] and could have caused the mismatch.`;
          // TODO: Consider retrying without those that were exactly on the `previousDate` or
          // `currentDate`
        }
        processingErrors.push(new SumOfChangeRecordsNotEqualToDifference(
          errorMessage,
          null,
          {
            changeRecordsSum,
            pendingLiabilityDifference: difference,
            recordsExactlyInDateRange: exactlyInDateRangeSrNos,
          },
        ));
      }

      if (changeRecords.length === 0) {
        processingErrors.push(new NoChangeRecordsFoundError(`Failed to find any records that caused a change of ${difference} in '${liabilityType}'`));
      } else {
        // Get all the records each change record is linked to, even if the record they are linked
        // to is not from within the date range. This is needed to generate system errors from,
        // e.g. payment's returns.
        const changeRecordsWithPairInfo = changeRecords.map(
          record => pairedRecordsBySrNo.get(record.srNo),
        );

        const response = await getReasonStringRecords({
          records: changeRecordsWithPairInfo,
          recordsBySrNo: pairedRecordsBySrNo,
          closingBalances,
          difference,
          taxTypeId,
          liabilityType,
          client,
          parentTaskId,
        });

        // Generate change reason details for each reason string record (@see `reasonStringRecords`)
        // and add any system errors that the reason string records might have.
        for (const { record, systemErrors } of response.reasonStringRecords.values()) {
          const details = generateChangeReasonDetails({
            record,
            recordsByPeriod: pairedRecordsByPeriod,
            recordsBySrNo: pairedRecordsBySrNo,
          });
          if (systemErrors.length > 0) {
            details.systemErrors.push(...systemErrors);
          }
          changeReasonDetails.push(details);
        }

        if (response.processingErrors.length > 0) {
          processingErrors.push(...response.processingErrors);
        }
      }
    } else {
      changeReasonDetails.push({ change: false });
    }

    changeReasonDetails = removeDuplicateChangeReasonDetails(changeReasonDetails);

    const changeReasons = changeReasonDetails.map(
      details => generateChangeReasonString(taxTypeId, details),
    );
    // FIXME: Merge similar change reasons compactly.
    // When the date and other meta data is the same, only the header is required from each.
    // E.g. "Late return,\nLate payment,\nLate payment"
    changeReasonsByLiability[liabilityType] = changeReasons.join('\n\n');
  })());
  await Promise.all(liabilityPromises);
  return {
    changeReasonsByLiability,
    processingErrors,
    invalidRecords,
    taxPayerLedgerRecords,
    anyErrors: processingErrors.length > 0 || invalidRecords.length > 0,
  };
}
