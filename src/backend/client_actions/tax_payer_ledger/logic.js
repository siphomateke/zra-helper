import moment from 'moment';
import parseNarration, { narrationGroups, narrationTypes } from './narration';
import { parseAmountString, scaleZraAmount } from '@/backend/content_scripts/helpers/zra';
import { pendingLiabilityTypes } from '../pending_liabilities';
import { objectsEqual } from '@/utils';
import getDataFromReceipt from '@/backend/content_scripts/helpers/receipt_data';
import { generateAckReceiptRequest } from '../return_history/ack_receipt';
import { getAllReturnHistoryRecords } from '../return_history/base';
import { getDocumentByAjax } from '@/backend/utils';
import generateChangeReasonString from './reason_string';
import { LedgerError } from '@/backend/errors';

/**
 * @typedef {import('@/backend/constants').Date} Date
 * @typedef {import('@/backend/constants').UnixDate} UnixDate
 * @typedef {import('./narration').ParsedNarrationType} ParsedNarrationType
 * @typedef {import('@/backend/reports').TaxPayerLedgerRecord} TaxPayerLedgerRecord
 * @typedef {import('./narration').NarrationType} NarrationType
 * @typedef {import('../pending_liabilities').PendingLiabilityType} PendingLiabilityType
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
 * @param {Map<string, Record>} records Records stored by serial number.
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
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record[]} records
 * @returns {Map<string, Record>}
 */
function getRecordsBySerialNumber(records) {
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
 * @typedef {Object} PastWeekRecordsResponse
 * @property {Record[]} withinLastWeek
 * @property {Record[]} exactlyAWeekAgo
 */

/**
 * Gets all transactions that took place in the past week.
 * @template {ParsedTaxPayerLedgerRecord} Record
 * @param {Record[]} records
 * @param {number} currentDate
 * @returns {PastWeekRecordsResponse<Record>}
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
function recordMatchesPayment(record, payment) {
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
    // FIXME: Fix these assessment matches. Do they both match additional assessments?
    // Is that all they match?
    'assessment liability': t.ADDITIONAL_ASSESSMENT,
    'assessment manual penalty': t.ADDITIONAL_ASSESSMENT,
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
      record.narration.type === narrationTypes.PAYMENT
      || record.narration.type === narrationTypes.ADVANCE_PAYMENT
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
 * @property {LedgerSystemError} [systemError]
 * @property {ParsedNarrationType} [narration]
 * @property {string|string[]} [prn]
 * @property {string|string[]} [assessmentNumber]
 */

/**
 * Generates the details about why a change in pending liabilities happened based on a record.
 * @param {Object} options
 * @param {PairedLedgerRecord} options.record
 * @param {RecordsByPeriod<any>} options.recordsByPeriod
 * @param {ClosingBalancesByPeriod<any>} options.closingBalances
 * @param {number} options.difference
 * @param {import('@/backend/constants').TaxTypeNumericalCode} options.taxTypeId
 * @param {PendingLiabilityType} options.liabilityType
 * @param {import('@/backend/constants').Client} options.client
 * @param {number} options.parentTaskId
 * @returns {Promise.<ChangeReasonDetails>}
 */
async function generateChangeReasonDetails({
  record,
  recordsByPeriod,
  closingBalances,
  difference,
  taxTypeId,
  liabilityType,
  client,
  parentTaskId,
}) {
  /** @type {ChangeReasonDetails} */
  const details = {
    change: true,
    fromDate: record.fromDate,
    toDate: record.toDate,
    transactionDate: record.transactionDate,
    narration: record.narration,
    systemError: null,
  };

  // FIXME: Link late payments to assessments or payments depending on what exists.

  if (record.narration.group === narrationGroups.PAYMENTS) {
    details.prn = record.narration.meta.prn || record.narration.meta.refPrn;
  } else if ([
    narrationTypes.LATE_PAYMENT_INTEREST,
    narrationTypes.LATE_PAYMENT_PENALTY,
    narrationTypes.LATE_RETURN_PENALTY,
  ].includes(record.narration.type)) {
    // TODO: Test getting PRN from payment in same period.
    details.prn = getRecordPrn(record, recordsByPeriod);
  }

  if (record.narration.group === narrationGroups.ASSESSMENTS) {
    details.assessmentNumber = record.narration.meta.assessmentNumber;
  } else if ('assessmentNumber' in record.narration.meta) {
    details.assessmentNumber = record.narration.meta.assessmentNumber;
  } else if (
    record.narration.type === narrationTypes.PENALTY_FOR_AMENDED_ASSESSMENT
    || (
      record.narration.type === narrationTypes.PAYMENT
      && record.narration.meta.against === 'assessment manual penalty'
    )
  ) {
    // TODO: Test getting assessment number from assessment in same period.
    details.assessmentNumber = getRecordAssessmentNumber(record, recordsByPeriod);
  }

  // If pending liabilities increased from last week
  // FIXME: Make sure the record is a return. E.g. if the cause was actually a payment, we need to
  // check its return, not the payment.
  if (difference > 0 && record.narration.group === narrationGroups.RETURNS) {
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
            details.systemError = ledgerSystemErrors.RETURN_ROUNDED_UP;
          }
        } else {
          for (const amount of possibleLiabilityAmounts) {
            if (record.paymentsSum === amount) {
              details.systemError = ledgerSystemErrors.RETURN_ROUNDED_UP;
              break;
            }
          }
          // TODO: Make a note that it's probably a system error but we can't confirm it.
        }
      }
    } else {
      // TODO: Confirm that this shouldn't run if principal increased by less than a Kwacha.
      // FIXME: Handle closing balance not existing. This shouldn't happen but just in case.
      const closingBalance = closingBalances[record.fromDate];
      // Note: No need to make sure advance payments are greater than zero and thus contributed to
      // the closing balance because zero records will have already been removed.
      if (closingBalanceIsZero(closingBalance) && record.advancePayments.length > 0) {
        // TODO: Make sure this check works
        details.systemError = ledgerSystemErrors.UNALLOCATED_ADVANCE_PAYMENT;
      }
    }
  }
  return details;
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
  if (liabilityType === 'interest') {
    return record.narration.group === narrationGroups.INTEREST;
  } if (liabilityType === 'penalty') {
    return record.narration.group === narrationGroups.PENALTIES;
  } if (liabilityType === 'principal') {
    return true;
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
  // Note: It's OK to do this before removing reversals because the reversals will also be zero.
  parsedLedgerRecords = removeZeroRecords(parsedLedgerRecords);

  // FIXME: This should only be done when actually looking for records that caused a change.
  // This is because to detect various system errors and extract PRNs and assessment numbers, we
  // need all the records. E.g. if a payment caused the change from last week but only because of
  // a system error, to detect the error we need to see the return which may have been filed before
  // last week.
  const pastWeekRecords = getRecordsFromPastWeek(parsedLedgerRecords, currentDate);
  parsedLedgerRecords = pastWeekRecords.withinLastWeek;

  // The ZRA website sorts by fromDate by default but since we sorted by transaction date we
  // have to restore the original order.
  parsedLedgerRecords = sortRecordsBySerialNumber(parsedLedgerRecords);
  // Remove any records that were later reversed
  parsedLedgerRecords = removeReversals(parsedLedgerRecords);

  // TODO: Find out if we shouldn't remove zero records before running pair records. It's
  // probably OK because any pairs would also have to be zero. Not sure though because
  // penalties seem to still apply to zero records.
  const pairedRecords = pairRecords(parsedLedgerRecords);

  const unbalancedRecords = removeBalancedRecords(pairedRecords);

  const recordsByPeriod = getRecordsByPeriod(unbalancedRecords);

  const changeReasonsByLiability = {};
  const liabilityPromises = pendingLiabilityTypes.map(liabilityType => (async () => {
    /** @type {ChangeReasonDetails[]} */
    let changeReasonDetails = [];
    const lastWeek = parseAmountString(lastPendingLiabilityTotals[liabilityType]);
    const thisWeek = parseAmountString(pendingLiabilityTotals[liabilityType]);
    if (lastWeek === null || thisWeek === null) {
      throw new LedgerError('Invalid pending liability totals', 'InvalidTotals');
    }
    const difference = thisWeek - lastWeek;
    if (Math.abs(difference) > 0) {
      // TODO: Test this. `example1_output.csv` is a good sample.
      /** Records that could have contributed to the current pending liability type changing. */
      const potentialChangeRecords = filterRecordsByLiabilityType(unbalancedRecords, liabilityType);

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
        // TODO: There shouldn't ever be more than one record that exactly matches the difference.
        // However, if there is, a warning should be shown.

        // If there is no single record that exactly matches the amount, then any of the unbalanced
        // records from the last week could have contributed to the change.
        changeRecords = potentialChangeRecords;
      }

      // TODO: Consider not including records in changeRecords that were already used for other
      // pending liability types to increase performance.

      // Confirm that the records add up to the difference
      let sum = 0;
      for (const record of changeRecords) {
        sum += getRecordBalance(record);
      }
      if (sum !== difference) {
        // TODO: Make a note of this
        // Check if any transactions took place exactly 7 days ago.
        if (pastWeekRecords.exactlyAWeekAgo.length > 0) {
          // If some did, that could be why things don't add up.
          // TODO: Make note of this
          // TODO: Consider retrying without those from exactly a week ago
        }
      }

      // FIXME: Somehow merge counterparts when generating reasons. E.g. if the change records are
      // a return and its payments we probably don't want all the payments.

      changeReasonDetails = await Promise.all(
        changeRecords.map(
          record => generateChangeReasonDetails({
            record,
            recordsByPeriod,
            closingBalances,
            difference,
            taxTypeId,
            liabilityType,
            client,
            parentTaskId,
          }),
        ),
      );
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
  return changeReasonsByLiability;
}
