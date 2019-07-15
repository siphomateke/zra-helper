import validateParsedNarration from './narration_validation';

/**
 * Map containing which value columns narrations affect.
 *
 * - 0 = debit
 * - 1 = credit
 * - 2 = both
 */
export const narrationExpectedValueCol = {
  TARPS_BALANCE: 0,
  ADVANCE_PAYMENT: 1,
  PAYMENT: 1,
  CLOSING_BALANCE: 2,
  LATE_PAYMENT_PENALTY: 0,
  LATE_PAYMENT_INTEREST: 0,
  LATE_RETURN_PENALTY: 0,
  PROVISIONAL_RETURN: 0,
  REVISED_PROVISIONAL_RETURN: 0,
  ORIGINAL_RETURN: 0,
  SUPPLEMENTARY_RETURN: 0,
  AMENDED_RETURN: 0,
  AUDIT_ASSESSMENT: 0,
  ADDITIONAL_ASSESSMENT: 0,
  ESTIMATED_ASSESSMENT: 0,
  AUDIT_ASSESSMENT_PENALTY: 0,
  ADDITIONAL_ASSESSMENT_PENALTY: 0,
  BEING_PENALTY_UNDER_ESTIMATION_PROVISIONAL_TAX: 0,
  AMENDED_ASSESSMENT: 1,
  PENALTY_FOR_AMENDED_ASSESSMENT: 1,
  REFUND_OFFSET: 1,
  REFUND_PAID: 0,
  BEING_POSTING_OPENING_BALANCE_MIGRATED: 1,
  BEING_REVERSAL_DUPLICATE_PAYMENT: 0,
  BEING_REVERSAL_REPLICATED_TRANSACTION: 1,
};

/**
 * @typedef {Object} ParsedRecordValidation
 * @property {string} srNo
 * @property {boolean} valid
 * @property {boolean} multipleValueColumns
 * Whether this record incorrectly has a value in both debit and credit.
 * @property {boolean} invalidValueColumn
 * True if this record's value is in the wrong column for the narration.
 * @property {'debit'|'credit'} expectedValueColumn
 * The column that this record's value should be in based on its narration and reversal state.
 * @property {import('./narration_validation').ValidateParsedNarrationResult} narrationValidation
 */

/**
 * Validates parsed ledger records narrations.
 * @param {import('./logic').ParsedTaxPayerLedgerRecord[]} records
 * @returns {Promise<ParsedRecordValidation[]>}
 */
// TODO: Make sure cumulative balance is correct
export async function validateParsedLedgerRecords(records) {
  const narrationValidations = await Promise.all(
    records.map(({ narration }) => validateParsedNarration(narration)),
  );
  /** @type {ParsedRecordValidation[]} */
  const recordValidations = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    /** @type {ParsedRecordValidation} */
    const validation = {
      srNo: record.srNo,
      valid: true,
      multipleValueColumns: false,
      invalidValueColumn: false,
      expectedValueColumn: null,
      narrationValidation: narrationValidations[i],
    };
    // Make sure no record has debit AND credit
    if (record.debit > 0 && record.credit > 0) {
      validation.multipleValueColumns = true;
    } else {
      /** The column this record's value should be in based on its narration type. */
      const expectedColCode = narrationExpectedValueCol[record.narration.type];
      // Don't bother checking if the value is in the correct column if it doesn't matter for this
      // narration type.
      if (expectedColCode < 2) {
        let expectedColIsDebit = expectedColCode === 0;
        // If the record is reversed, the values will be in the opposite column.
        if (record.narration.reversal) {
          expectedColIsDebit = !expectedColIsDebit;
        }
        const expectedCol = expectedColIsDebit ? 'debit' : 'credit';
        const unexpectedCol = expectedColIsDebit ? 'credit' : 'debit';
        // If this record's value is in the wrong column.
        if (record[unexpectedCol] > 0) {
          validation.invalidValueColumn = true;
          validation.expectedValueColumn = expectedCol;
        }
      }
    }
    if (
      validation.multipleValueColumns
      || validation.invalidValueColumn
      || !validation.narrationValidation.valid
    ) {
      validation.valid = false;
    }
    recordValidations.push(validation);
  }
  return recordValidations;
}
