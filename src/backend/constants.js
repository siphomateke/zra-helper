/**
 * @typedef Client
 * @property {string} name
 * @property {string} username
 * @property {string} password
 */

/**
 * @typedef {string} Date Date in the format 'DD/MM/YYYY'
 * @typedef {string} ReferenceNumber
 */

// #region Tax Types
/**
 * @typedef {string} TaxTypeCode
 * Abbreviated tax type name. For example, 'ITX' (income tax) and 'WHT' (withholding tax).
 */

/**
 * @typedef {string} TaxTypeNumericalCode
 * Two-digit tax type code. For example, '01' (income tax) and '02' (value added tax).
 */

/**
 * Enum for tax type codes.
 * @type {Object.<TaxTypeNumericalCode, TaxTypeCode>}
 */
export const taxTypes = {
  '01': 'ITX',
  '02': 'VAT',
  '03': 'PAYE',
  '05': 'TOT',
  '06': 'WHT',
  '07': 'PTT',
  '08': 'MINROY',
  '09': 'TLEVY',
};

/**
 * Enum for numerical tax type codes.
 * @type {Object.<TaxTypeCode, TaxTypeNumericalCode>}
 */
export const taxTypeNumericalCodes = {
  ITX: '01',
  VAT: '02',
  PAYE: '03',
  TOT: '05',
  WHT: '06',
  PTT: '07',
  MINROY: '08',
  TLEVY: '09',
};

/**
 * @typedef {string} TaxTypeName
 * Human readable tax type name. For example, 'withholding tax' and 'medical levy tax'.
 */

/**
 * Maps tax type names to their corresponding numerical codes.
 * This is primarily used when parsing payment history receipts.
 * @type {Object.<TaxTypeName, TaxTypeNumericalCode>}
 */
export const taxTypeNames = {
  'income tax': taxTypeNumericalCodes.ITX,
  'value added tax': taxTypeNumericalCodes.VAT,
  'employment tax (pay as you earn)': taxTypeNumericalCodes.PAYE,
  'turnover tax': taxTypeNumericalCodes.TOT,
  'withholding tax': taxTypeNumericalCodes.WHT,
  'property transfer tax': taxTypeNumericalCodes.PTT,
  'mineral royalty': taxTypeNumericalCodes.MINROY,
  'medical levy tax': taxTypeNumericalCodes.TLEVY,
};
// #endregion
