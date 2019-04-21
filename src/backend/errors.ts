import { TaxAccountName } from './constants';

interface ExtendedErrorJson {
  message: string;
  code: string | null;
  type: string;
  props?: any;
  errorType: 'ExtendedError';
}

export class ExtendedError {
  error: Error;

  type: string = '';

  constructor(message: string, public code: string | null = '', public props: object = {}) {
    this.error = new Error(message);
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

  setType(type: string) {
    this.type = type;
    this.error.name = this.type;
  }

  /**
   * Creates an ExtendedError from a JSON representation of one
   */
  static fromJSON(json: ExtendedErrorJson): ExtendedError {
    const error = new ExtendedError(json.message, json.code, json.props);
    error.setType(json.type);
    return error;
  }

  /**
   * Converts this error to a JSON object
   */
  toJSON(): ExtendedErrorJson {
    return {
      message: this.message,
      code: this.code,
      type: this.type,
      props: this.props,
      errorType: 'ExtendedError',
    };
  }
}

interface ZraErrorProps {
  /** The error message reported by ZRA. */
  error: string;
}
export class ZraError extends ExtendedError {
  constructor(message: string, code = null, props: ZraErrorProps) {
    super(message, code, props);
    this.setType('ZraError');
  }
}

interface ElementsNotFoundErrorProps {
  /** Selectors of the elements that were not found. */
  selectors: string[];
  /** HTML of Node which we are searching for elements in. */
  html?: string | null;
}
export class ElementsNotFoundError extends ExtendedError {
  constructor(message: string, code = null, props: ElementsNotFoundErrorProps) {
    super(message, code, Object.assign({ html: null }, props));
    this.setType('ElementsNotFoundError');
  }
}
interface ElementNotFoundErrorProps {
  /** Selectors of the elements that were not found. */
  selector: string;
  /** HTML of Node which we are searching for elements in. */
  html?: string | null;
}
export class ElementNotFoundError extends ElementsNotFoundError {
  constructor(message: string, code = null, props: ElementNotFoundErrorProps) {
    super(message, code, {
      selectors: [props.selector],
      html: props.html || null,
    });
    this.setType('ElementNotFoundError');
  }
}

interface ImageLoadErrorProps {
  /** The url of the image that failed to load. */
  src: string;
}
export class ImageLoadError extends ExtendedError {
  constructor(message: string, code = null, props: ImageLoadErrorProps) {
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

interface LoginErrorProps {
  /** The name of the client that failed to login. */
  clientName?: string;
  /** Information about the client that is currently logged in. */
  loggedInClient?: string;
  /** The number of login attempts remaining before the client's account is locked. */
  attemptsRemaining?: number | null;
  /** Entire document string.Only thrown when the login error is unknown. */
  documentString?: string | null;
}
type LoginErrorCodes = 'PasswordExpired' | 'InvalidUsernameOrPassword' | 'WrongClient';
// TODO: Handle storing attempts remaining better. Perhaps a class that extends LoginError somehow
export class LoginError extends ExtendedError {
  constructor(message: string, code: LoginErrorCodes | null = null, props: LoginErrorProps) {
    super(message, code, Object.assign({ documentString: null }, props));
    this.setType('LoginError');
  }
}

interface LogoutErrorProps {
  /** HTML of logout page where the 'logged out successfully message should have been'. */
  html?: string | null;
}
export class LogoutError extends ExtendedError {
  constructor(message: string, code = null, props: LogoutErrorProps) {
    super(message, code, Object.assign({ html: null }, props));
    this.setType('LogoutError');
  }
}

interface TabErrorProps {
  /** The ID of the tab which had an error. */
  tabId: number;
}
type TabErrorCodes = 'Closed' | 'TimedOut';
export class TabError extends ExtendedError {
  constructor(message: string, code: TabErrorCodes | null = null, props: TabErrorProps) {
    super(message, code, props);
    this.setType('TabError');
  }
}

interface ExecuteScriptErrorProps {
  /** The ID of the tab to which an attempt was made to execute a script. */
  tabId: number;
}
type ExecuteScriptErrorTypes = 'NoAccess';
export class ExecuteScriptError extends ExtendedError {
  constructor(
    message: string,
    code: ExecuteScriptErrorTypes | null = null,
    props: ExecuteScriptErrorProps,
  ) {
    super(message, code, props);
    this.setType('ExecuteScriptError');
  }
}

interface SendMessageErrorProps {
  /** The ID of the tab to which sending a message failed. */
  tabId: number;
}
export class SendMessageError extends ExtendedError {
  constructor(message: string, code = null, props: SendMessageErrorProps) {
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

interface DownloadErrorProps {
  downloadItem: browser.downloads.DownloadItem;
}
type DownloadErrorCodes = browser.downloads.InterruptReason;
export class DownloadError extends ExtendedError {
  constructor(message: string, code: DownloadErrorCodes | null = null, props: DownloadErrorProps) {
    super(message, code, props);
    this.setType('DownloadError');
  }
}

interface ImagesInTabFailedToLoadProps {
  /** URLs of the images that failed to load. */
  unloadedImages: string[];
}
export class ImagesInTabFailedToLoad extends ExtendedError {
  constructor(message: string, code = null, props: ImagesInTabFailedToLoadProps) {
    super(message, code, props);
    this.setType('ImagesInTabFailedToLoad');
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

interface TaxAccountNameNotFoundProps {
  /** The name of the account that could not be found. */
  accountName: TaxAccountName;
}
export class TaxAccountNameNotFound extends ExtendedError {
  constructor(message: string, code = null, props: TaxAccountNameNotFoundProps) {
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

export class NoChangeRecordsFoundError extends LedgerError {
  /* eslint-disable max-len */
  /**
   *
   * @param {Object} props
   * @param {import('./client_actions/pending_liabilities').PendingLiabilityType} props.liabilityType
   */
  /* eslint-enable max-len */
  constructor(message, code = null, props = { liabilityType: null }) {
    super(message, code, props);
    this.setType('NoChangeRecordsFoundError');
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
   * The actual change in pending liabilities.
   * @param {string[]} props.recordsExactlyInDateRange
   * Serial numbers of records that took place on the starting or ending date.
   */
  constructor(message, code = null, props = {
    changeRecordsSum: null,
    pendingLiabilityDifference: null,
    recordsExactlyInDateRange: null,
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

export interface JsonError {
  message: string;
  code?: string;
  type?: string;
  props?: object;
  errorType?: 'ExtendedError';
}

/**
 * Converts an error to a JSON object
 */
export function errorToJson(error: Error): JsonError | null {
  if (error) {
    let output = {
      message: '',
    };
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
 */
export function errorFromJson(json: JsonError): ExtendedError | Error {
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
 */
export function errorToString(error: any): string {
  let errorString = '';
  if (typeof error !== 'undefined' && error !== null) {
    if (error instanceof ExtendedError) {
      errorString = `${error.type}: ${error.message}`;
    } else if (error instanceof Error) {
      errorString = error.toString();
    } else if (typeof error === 'object' && ('message' in error) && error.message) {
      errorString = error.message;
    } else if (typeof error === 'string') {
      errorString = `Error: ${error}`;
    } else {
      errorString = error.toString();
    }
  }
  return errorString;
}
