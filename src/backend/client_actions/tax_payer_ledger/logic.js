import moment from 'moment';
import parseNarration, { narrationGroups, narrationTypes } from './narration';
import { parseAmountString } from '@/backend/content_scripts/helpers/zra';
import { pendingLiabilityColumns, pendingLiabilityTypes } from '../pending_liabilities';
import { objectsEqual } from '@/utils';

/**
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
* @property {UnixDate} fromDate
* @property {UnixDate} toDate
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
      fromDate: parseDate(record.fromDate),
      toDate: parseDate(record.toDate),
    }));
  }
  return parsedRecords;
}

/**
 * @typedef {Object} ParsedPendingLiability
 * @property {string} srNo
 * @property {string} accountName
 * @property {UnixDate} periodFrom
 * @property {UnixDate} periodTo
 * @property {number} principal
 * @property {number} interest
 * @property {number} penalty
 * @property {number} total
 */

/**
 * Converts pending liabilities to a machine-readable format.
 * @param {import('../pending_liabilities').PendingLiability[]} records
 * @returns {ParsedPendingLiability[]}
 */
function parsePendingLiabilities(records) {
  const parsedRecords = [];
  for (const record of records) {
    const parsedRecord = {
      periodFrom: parseDate(record.periodFrom),
      periodTo: parseDate(record.periodTo),
    };
    for (const type of pendingLiabilityColumns) {
      parsedRecord[type] = parseAmountString(record[type]);
    }
    const recordCopy = Object.assign({}, record);
    parsedRecords.push(Object.assign(recordCopy, parsedRecord));
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
// FIXME: Take into account that all records must be reversed before being amended.
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
// FIXME: Handle records with `returnData`
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
      for (const amendment of record.returnData.amendments) {
        if (recordMatchesAmount(amendment, amount)) {
          return amendment;
        }
      }
    }
  }
  return null;
}

/**
 * Finds a pending liability with a certain pending liability type amount.
 * E.g. one with principal of 5.
 * @param {number} amount
 * @param {string} pendingLiabilityType Pending liability type. E.g. 'principal', 'interest'
 * @param {ParsedPendingLiability[]} records
 * @returns {ParsedPendingLiability|null}
 */
function findPendingLiabilityByAmount(amount, pendingLiabilityType, records) {
  for (const record of records) {
    if (record[pendingLiabilityType] === amount) {
      return record;
    }
  }
  return null;
}

/**
 * Finds the pending liability that matches a record in the tax payer ledger.
 *
 * This is done by searching for a pending liability with the same period as the record.
 * @param {ParsedTaxPayerLedgerRecord} record
 * @param {ParsedPendingLiability[]} pendingLiabilities
 * @returns {ParsedPendingLiability|null}
 */
function findMatchingPendingLiability(record, pendingLiabilities) {
  for (const pendingLiability of pendingLiabilities) {
    if (
      pendingLiability.periodFrom === record.fromDate
      && pendingLiability.periodTo === record.toDate
    ) {
      return pendingLiability;
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
// FIXME: Improve performance by sorting and stopping search once dates are older than a week.
export function getRecordsFromPastWeek(records, currentDate = new Date().valueOf()) {
  const exactlyAWeekAgo = [];
  const withinLastWeek = [];
  for (const record of records) {
    const diff = getDifferenceInDays(currentDate, record.transactionDate);
    if (diff >= 0 && diff <= 7) {
      withinLastWeek.push(record);
      if (diff === 7) {
        exactlyAWeekAgo.push(record);
      }
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
 * @property {number} amount The amount of the return or the latest amended amount.
 * @property {ParsedTaxPayerLedgerRecord[]} amendments Return amendments and revisions.
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
 * This depends on original returns being followed by their payments and amendments.
 * Because of this, PAYE and WHT don't currently work as they have returns that are split in two.
 * Additionally, revised provisional returns may not work as expected.
 *
 * Note: The payments for the return can be split up into multiple returns and don't always add
 * up to the return.
 * @param {ParsedTaxPayerLedgerRecord[]} records
 * @returns {ParsedLedgerRecordWithReturnData[]} Return data by serial number.
 */
// TODO: Add unit tests. Particularly for amended returns.
export function matchPaymentsToReturns(records) {
  const recordsWithReturnData = [];
  /** Keep track of records that are related to returns so we don't add them twice. */
  const processedRecords = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const recordCopy = Object.assign({}, record);
    if (
      record.narration.type === narrationTypes.ORIGINAL_RETURN
      || record.narration.type === narrationTypes.PROVISIONAL_RETURN
    ) {
      processedRecords.push(record.srNo);
      const returnData = {
        index: i,
        record,
        amount: record.debit,
        amendments: [],
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
        if (
          subRecord.narration.type === narrationTypes.ORIGINAL_RETURN
          || subRecord.narration.type === narrationTypes.PROVISIONAL_RETURN
        ) {
          // Done getting all payments for return. Now check if the sum of all the payments is equal
          // to the return amount.
          returnData.paymentsMatchReturn = returnData.paymentsSum === returnData.amount;
          break;
        } else if (
          subRecord.narration.type === narrationTypes.AMENDED_RETURN
          || subRecord.narration.type === narrationTypes.REVISED_PROVISIONAL_RETURN
        ) {
          // If the return was amended, we must take note of that as it affects which payments
          // match the return.
          returnData.amendments.push(subRecord);
          returnData.amount = subRecord.debit;
          processedRecords.push(subRecord.srNo);
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
 * @typedef {Object} ChangeReasonDetails
 * @property {UnixDate} fromDate
 * @property {UnixDate} toDate
 * @property {UnixDate} transactionDate
 * @property {LedgerSystemError} systemError
 * @property {ParsedNarrationType} narration
 * @property {string} [prn]
 */

/**
 * Generates the details about why a change in pending liabilities happened based on a record.
 * @param {Object} options
 * @param {ParsedLedgerRecordWithReturnData} options.record
 * @param {number} options.difference
 * @param {string} options.pendingLiabilityType Pending liability type. E.g. 'principal', 'interest'
 * @param {ParsedPendingLiability[]} options.parsedPendingLiabilities
 * @param {ClosingBalancesByPeriod} options.closingBalances
 * @returns {ChangeReasonDetails}
 */
function generateChangeReasonDetails({
  record,
  difference,
  pendingLiabilityType,
  parsedPendingLiabilities,
  closingBalances,
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

  // If pending liabilities increased from last week.
  if (difference > 0) {
    // If specifically principal increased by less than a kwacha
    if (pendingLiabilityType === 'principal' && difference < 1) {
      // In this case, the return has been rounded up but the payment is still exact and correct.
      // Double check that that is the case.
      // FIXME: To make sure this is the system error case, we must check ack return receipt.
      if (
        !record.returnData.paymentsMatchReturn
        && Math.ceil(record.returnData.amount) === record.returnData.paymentsSum
      ) {
        details.systemError = ledgerSystemErrors.RETURN_ROUNDED_UP;
      } else {
        // Assumption was incorrect. This is an unknown case.
        // TODO: Show warning?
      }
    } else {
      // TODO: Confirm that this shouldn't run if principal increased by less than a Kwacha.
      /* const pendingLiabilityRecord = findMatchingPendingLiability(
        record,
        parsedPendingLiabilities,
      );
      let discrepancy = false;
      if (pendingLiabilityRecord) {
        const pendingLiabilityAmount = pendingLiabilityRecord[pendingLiabilityType];
        if (pendingLiabilityAmount !== record.returnData.amount) {
          discrepancy = true;
        }
      } else {
        // Couldn't find a matching pending liability.
        // TODO: Make a distinction between this and the values not being equal.
        discrepancy = true;
      }
      if (discrepancy) {
        // A discrepancy can be caused by an advance payment being paid to the account
        // but not allocated to any period or liability. This is a system error.
        details.systemError = ledgerSystemErrors.ADVANCE_PAYMENT;
      } */

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

export default function taxPayerLedgerLogic({
  taxTypeId,
  lastPendingLiabilityTotals,
  pendingLiabilities,
  pendingLiabilityTotals,
  taxPayerLedgerRecords,
  currentDate = new Date().valueOf(), // FIXME: Remove this
}) {
  // const parsedPendingLiabilities = parsePendingLiabilities(pendingLiabilities);
  const parsedPendingLiabilities = [];
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
    // FIXME: Make sure totals are not empty.
    const lastWeek = parseAmountString(lastPendingLiabilityTotals[pendingLiabilityType]);
    const thisWeek = parseAmountString(pendingLiabilityTotals[pendingLiabilityType]);
    const difference = thisWeek - lastWeek;
    if (Math.abs(difference) > 0) {
      const changeReasons = [];
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

      for (const record of changeRecords) {
        const details = generateChangeReasonDetails({
          record,
          closingBalances,
          difference,
          pendingLiabilityType,
          parsedPendingLiabilities,
        });
        changeReasons.push(details);
      }
      changeReasonsByLiability[pendingLiabilityType] = changeReasons;
    } else {
      // TODO: Handle no change from last week.
    }
  }
  return changeReasonsByLiability;
}
