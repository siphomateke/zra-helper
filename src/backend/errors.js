export class ExtendedError {
  constructor(message, code = null, props = {}) {
    this.error = new Error(message);
    this.code = code;
    this.props = props;
    this.setType('ExtendedError');
  }

  get message() {
    return this.error.message;
  }

  set message(value) {
    this.error.message = value;
  }

  get name() {
    return this.error.name;
  }

  setType(type) {
    this.type = type;
    this.error.name = this.type;
  }

  /**
   * @typedef ExtendedErrorJson
   * @property {string} message
   * @property {string} code
   * @property {string} type
   * @property {any} [props]
   * @property {'ExtendedError'} errorType
   */

  /**
   * Creates an ExtendedError from a JSON representation of one
   *
   * @param {ExtendedErrorJson} json
   * @returns {ExtendedError}
   */
  static fromJSON(json) {
    const error = new ExtendedError(json.message, json.code, json.props);
    error.setType(json.type);
    return error;
  }

  /**
   * Converts this error to a JSON object
   *
   * @returns {ExtendedErrorJson}
   */
  toJSON() {
    return {
      message: this.message,
      code: this.code,
      type: this.type,
      props: this.props,
      errorType: 'ExtendedError',
    };
  }
}

export class ZraError extends ExtendedError {
  /**
   * @param {Object} props
   * @param {string} props.error The error message reported by ZRA.
   */
  constructor(message, code = null, props = { error: null }) {
    super(message, code, props);
    this.setType('ZraError');
  }
}
export class ElementsNotFoundError extends ExtendedError {
  /**
   * @param {Object} props
   * @param {string[]} props.selectors Selectors of the elements that were not found.
   * @param {string} [props.html] HTML of Node which we are searching for elements in.
   */
  constructor(message, code = null, props = { selectors: null, html: null }) {
    super(message, code, props);
    this.setType('ElementsNotFoundError');
  }
}
export class ElementNotFoundError extends ElementsNotFoundError {
  /**
   * @param {Object} props
   * @param {string} props.selector Selector of the element that was not found.
   * @param {string} [props.html] HTML of Node which we are searching for elements in.
   */
  constructor(message, code = null, props = { selector: null, html: null }) {
    super(message, code, {
      selectors: [props.selector],
      html: props.html,
    });
    this.setType('ElementNotFoundError');
  }
}
export class ImageLoadError extends ExtendedError {
  /**
   * @param {Object} props
   * @param {string} props.src The url of the image that failed to load.
   */
  constructor(message, code = null, props = { src: null }) {
    super(message, code, props);
    this.setType('ImageLoadError');
  }
}
export class CaptchaLoadError extends ImageLoadError {
  constructor(...args) {
    super(...args);
    this.setType('CaptchaLoadError');
  }
}

// codes include:
// PasswordExpired
// InvalidUsernameOrPassword
// WrongClient

// TODO: Handle storing attempts remaining better. Perhaps a class that extends LoginError somehow
export class LoginError extends ExtendedError {
  /**
   * @param {Object} props
   * @param {string} [props.clientName] The name of the client that failed to login.
   * @param {string} [props.loggedInClient]
   * Information about the client that is currently logged in.
   * @param {string} [props.attemptsRemaining]
   * The number of login attempts remaining before the client's account is locked.
   * @param {string} [props.documentString]
   * Entire document string. Only thrown when the login error is unknown.
   */
  constructor(message, code = null, props = {
    clientName: null,
    loggedInClient: null,
    attemptsRemaining: null,
    documentString: null,
  }) {
    super(message, code, props);
    this.setType('LoginError');
  }
}
export class LogoutError extends ExtendedError {
  /**
   * @param {Object} props
   * @param {string} [props.html]
   * HTML of logout page where the 'logged out successfully message should have been'.
   */
  constructor(message, code = null, props = { html: null }) {
    super(message, code, props);
    this.setType('LogoutError');
  }
}

export class TabError extends ExtendedError {
  /**
   * @param {Object} props
   * @param {number} props.tabId The ID of the tab which had an error.
   */
  constructor(message, code = null, props = { tabId: null }) {
    super(message, code, props);
    this.setType('TabError');
  }
}
export class ExecuteScriptError extends ExtendedError {
  /**
   * @param {Object} props
   * @param {number} props.tabId The ID of the tab to which an attempt was made to execute a script.
   */
  constructor(message, code = null, props = { tabId: null }) {
    super(message, code, props);
    this.setType('ExecuteScriptError');
  }
}
export class SendMessageError extends ExtendedError {
  /**
   * @param {Object} props
   * @param {number} props.tabId The ID of the tab to which sending a message failed.
   */
  constructor(message, code = null, props = { tabId: null }) {
    super(message, code, props);
    this.setType('SendMessageError');
  }
}
export class InvalidReceiptError extends ExtendedError {
  constructor(...args) {
    super(...args);
    this.setType('InvalidReceiptError');
  }
}
export class DownloadError extends ExtendedError {
  /**
   * @param {Object} props
   * @param {Object} props.downloadItem
   */
  constructor(message, code = null, props = { downloadItem: null }) {
    super(message, code, props);
    this.setType('DownloadError');
  }
}

export class InvalidTaxType extends ExtendedError {
  constructor(...args) {
    super(...args);
    this.setType('InvalidTaxType');
  }
}
export class MissingTaxTypesError extends ExtendedError {
  constructor(...args) {
    super(...args);
    this.setType('MissingTaxTypes');
  }
}
export class TaxAccountNameNotFound extends ExtendedError {
  /**
   * @param {Object} props
   * @param {string} props.accountName The name of the account that could not be found.
   */
  constructor(message, code = null, props = { accountName: null }) {
    super(message, code, props);
    this.setType('TaxAccountNameNotFound');
  }
}

export class LedgerError extends ExtendedError {
  constructor(...args) {
    super(...args);
    this.setType('LedgerError');
  }
}

/**
 * Thrown when a closing balance for a record couldn't be found with the same period as the record.
 * This is checked when trying to determine if a return has any unallocated advance payments.
 */
export class ClosingBalanceMissingError extends LedgerError {
  /**
   *
   * @param {Object} props
   * @param {Object} props.record
   * The record for which a closing balance in the same period could not be found.
   */
  constructor(message, code = null, props = { record: null }) {
    super(message, code, props);
    this.setType('ClosingBalanceMissing');
  }
}

export class MultipleExactDifferenceMatches extends LedgerError {
  /**
   *
   * @param {Object} props
   * @param {Object} props.matchingRecords
   * The records that exactly match the change in pending liabilities.
   */
  constructor(message, code = null, props = { matchingRecords: null }) {
    super(message, code, props);
    this.setType('MultipleExactDifferenceMatches');
  }
}

export class SumOfChangeRecordsNotEqualToDifference extends LedgerError {
  /**
   * @param {Object} props
   * @param {number} props.changeRecordsSum
   * The sum of the records determined to have caused a change in pending liabilities.
   * @param {number} props.pendingLiabilityDifference
   * The actual change in pending liabilities from last week.
   * @param {string[]} props.recordsFromExactlyAWeekAgo
   * Serial numbers of records that took place exactly a week ago.
   */
  constructor(message, code = null, props = {
    changeRecordsSum: null,
    pendingLiabilityDifference: null,
    recordsFromExactlyAWeekAgo: null,
  }) {
    super(message, code, props);
    this.setType('SumOfChangeRecordsNotEqualToDifference');
  }
}

/**
 * When confirming if a return's amount was incorrectly rounded up, its corresponding
 * acknowledgement receipt is checked. This error means that multiple matching receipts were found
 * and thus whether the return was rounded up can not be 100% confirmed.
 */
export class ExactAckReceiptNotFound extends LedgerError {
  /**
   *
   * @param {Object} props
   * @param {Object} props.record
   * The return record that was being checked for a rounded up system error.
   * @param {boolean} props.foundAmountMatch
   * Whether one of the possible ack receipts' amounts matched the return's.
   */
  constructor(message, code = null, props = { record: null, foundAmountMatch: null }) {
    super(message, code, props);
    this.setType('ExactAckReceiptNotFound');
  }
}

/**
 * @typedef JsonError
 * @property {string} message
 * @property {string} [code]
 * @property {string} [type]
 * @property {Object} [props]
 * @property {'ExtendedError'} [errorType]
 */

/**
 * Converts an error to a JSON object
 *
 * @param {Error} error
 * @returns {JsonError|null}
 */
export function errorToJson(error) {
  if (error) {
    let output = {};
    if (error instanceof ExtendedError) {
      output = error.toJSON();
    } else if (error.message) {
      output.message = error.message;
    } else {
      output.message = error.toString();
    }
    return output;
  }
  return null;
}

/**
 * Creates an Error from it's JSON representation
 *
 * @param {JsonError} json
 * @returns {ExtendedError|Error}
 */
export function errorFromJson(json) {
  let output = null;
  if (json.errorType === 'ExtendedError') {
    output = ExtendedError.fromJSON(json);
  } else {
    output = new Error(json.message);
  }
  return output;
}

/**
 * Converts any error type to a string.
 * @param {*} error
 * @returns {string}
 */
export function errorToString(error) {
  let errorString = '';
  if (typeof error === 'object' && !(error instanceof Error) && error.message) {
    errorString = error.message;
  } else if (error instanceof ExtendedError) {
    errorString = `${error.type}: ${error.message}`;
  } else if (typeof error === 'string') {
    errorString = `Error: ${error}`;
  } else if (typeof error !== 'undefined' && error !== null) {
    errorString = error.toString();
  }
  return errorString;
}
