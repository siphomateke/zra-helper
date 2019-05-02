// #region Browser
/**
 * @typedef {string} BrowserCode
 *
 * @enum {BrowserCode}
 */
export const browserCodes = {
  CHROME: 'chrome',
  FIREFOX: 'firefox',
};

/**
 * Human-readable names of browsers
 * @type {Object.<BrowserCode, string>}
 */
export const browserNames = {
  [browserCodes.CHROME]: 'Chrome',
  [browserCodes.FIREFOX]: 'Firefox',
};

/**
 * @typedef {string} BrowserFeature
 *
 * @enum {BrowserFeature}
 */
export const browserFeatures = {
  MHTML: 'saveAsMhtml',
};

/** @type {Object.<BrowserCode, BrowserFeature[]>} */
export const featuresSupportedByBrowsers = {
  [browserCodes.CHROME]: [browserFeatures.MHTML],
  [browserCodes.FIREFOX]: [],
};
// #endregion

// #region Clients
/**
 * @typedef {string} ClientValidationError
 */

/** @enum {ClientValidationError} */
export const clientPropValidationErrors = {
  MISSING: 'MISSING',
  TPIN_SHORT: 'TPIN_SHORT',
  PASSWORD_SHORT: 'PASSWORD_SHORT',
};

/**
 * Human-readable versions of the client property validation error codes.
 * @type {Object.<ClientValidationError, string>}
 */
export const clientPropValidationErrorMessages = {
  [clientPropValidationErrors.MISSING]: 'Field must not be blank',
  [clientPropValidationErrors.TPIN_SHORT]: 'TPIN (username) must be a 10 digit number',
  [clientPropValidationErrors.PASSWORD_SHORT]: 'Password must be at least 8 characters long',
};

/**
 * @typedef ParsedClient
 * @property {number} id
 * @property {string} name
 * @property {string} username
 * @property {string} password
 * @property {boolean} valid
 * @property {string[]} [errors] An array of errors that will be set when the client is invalid
 * @property {Object.<string, ClientValidationError[]>} [propErrors]
 * List of validation errors per property
 *
 * @typedef {import('@/backend/client_actions/utils').TaxAccount[]} TaxAccounts
 *
 * @typedef {Object} ClientState
 * @property {TaxTypeNumericalCode[]|null} taxTypes
 * List of numerical tax type codes that this client has registered.
 * @property {TaxAccounts} taxAccounts All the tax accounts this client has.
 * @property {TaxAccounts} registeredTaxAccounts Tax accounts whose status is 'registered'.
 *
 * @typedef {ParsedClient & ClientState} Client
 */

/**
 * @typedef {string} Date Date in the format 'DD/MM/YYYY'
 * @typedef {number} UnixDate
 * @typedef {string} ReferenceNumber
 */
// #endregion

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
  'mineral royalty tax': taxTypeNumericalCodes.MINROY,
  'medical levy tax': taxTypeNumericalCodes.TLEVY,
};

/**
 * Tax type names found in the results of tax payer searches mapped to their corresponding
 * numerical codes.
 * @type {Object.<string, TaxTypeNumericalCode>}
 */
export const taxPayerSearchTaxTypeNames = {
  'income tax': taxTypeNumericalCodes.ITX,
  vat: taxTypeNumericalCodes.VAT,
  paye: taxTypeNumericalCodes.PAYE,
  'turnover tax': taxTypeNumericalCodes.TOT,
  'withholding tax': taxTypeNumericalCodes.WHT,
  'property transfer tax': taxTypeNumericalCodes.PTT,
  ptt: taxTypeNumericalCodes.PTT,
  'mineral royalty': taxTypeNumericalCodes.MINROY,
  'medical levy tax': taxTypeNumericalCodes.TLEVY,
};

// #endregion

// #region Export
/**
 * @typedef {string} ExportFormatCode
 *
 * @enum {ExportFormatCode}
 */
export const exportFormatCodes = {
  TXT: 'txt',
  CSV: 'csv',
  JSON: 'json',
};

/**
 * @typedef ExportFormat
 * @property {string} name
 * @property {string} extension
 * @property {string} mime
 */

/** @type {Object.<ExportFormatCode, ExportFormat>} */
export const exportFormats = {
  [exportFormatCodes.TXT]: {
    name: 'Text',
    extension: 'txt',
    mime: 'text/plain',
  },
  [exportFormatCodes.JSON]: {
    name: 'JSON',
    extension: 'json',
    mime: 'text/json',
  },
  [exportFormatCodes.CSV]: {
    name: 'CSV',
    extension: 'csv',
    mime: 'text/csv',
  },
};
// #endregion
