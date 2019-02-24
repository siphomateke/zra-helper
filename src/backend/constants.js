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
 * @typedef Client
 * @property {number} id
 * @property {string} name
 * @property {string} username
 * @property {string} password
 * @property {boolean} valid
 * @property {string[]} [errors] An array of errors that will be set when the client is invalid
 * @property {Object.<string, ClientValidationError[]>} [propErrors]
 * List of validation errors per property
 */

/**
 * @typedef {Object} ClientActionFunctionParam
 * @property {Client} client
 * @property {import('@/transitional/tasks').TaskObject} parentTask
 * @property {Object} clientActionConfig this client action's config
 * @property {number} loggedInTabId ID of the logged in tab.
 */

/**
 * @callback ClientActionFunction
 * @param {ClientActionFunctionParam} param
 * @returns {Promise.<Object>}
 */

/**
 * @typedef {'csv'|'json'} ClientActionOutputFormat
 */

/**
 * @callback ClientActionOutputFormatter
 * @param {import('@/store/modules/client_actions/index').ClientActionOutput[]} outputs
 * @param {ClientActionOutputFormat} format
 * @returns {any}
 */

/**
 * @typedef ClientActionObject
 * @property {string} id A unique camelCase ID to identify this client action.
 * @property {string} name The human-readable name of this client action.
 * @property {ClientActionFunction} [func]
 * @property {boolean} [hasOutput] Whether this client action returns an output.
 * @property {boolean} [usesLoggedInTab] Whether this action needs to open a page from a logged in tab.
 * If this is enabled, the page that is opened after logging in will not be closed until the user is
 * about to be logged out.
 * @property {ClientActionOutputFormat} [defaultOutputFormat]
 * @property {ClientActionOutputFormatter} [outputFormatter]
 * Function that formats the output into different formats such as CSV and JSON.
 */

/**
 * @typedef {string} Date Date in the format 'DD/MM/YYYY'
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
  'medical levy tax': taxTypeNumericalCodes.TLEVY,
};
// #endregion
