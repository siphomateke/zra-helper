export class ExtendedError extends Error {
  constructor(message, code = null, props = {}) {
    super(message);
    this.code = code;
    this.type = this.constructor.name;
    this.name = this.type;
    this.props = props;
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
    error.type = json.type;
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
  }
}
export class TaxTypeNotFoundError extends ExtendedError {
  /**
     * @param {Object} props
     * @param {string} props.taxTypeId The tax type that was not found.
     */
  constructor(message, code = null, props = { taxTypeId: null }) {
    super(message, code, props);
  }
}
export class TableError extends ExtendedError {}
export class ElementsNotFoundError extends ExtendedError {
  /**
     * @param {Object} props
     * @param {string[]} props.selectors Selectors of the elements that were not found.
     */
  constructor(message, code = null, props = { selectors: null }) {
    super(message, code, props);
  }
}
export class ElementNotFoundError extends ElementsNotFoundError {
  /**
     * @param {Object} props
     * @param {string} props.selector Selector of the element that was not found.
     */
  constructor(message, code = null, props = { selector: null }) {
    super(message, code, {
      selectors: [props.selector],
    });
  }
}
export class ImageLoadError extends ExtendedError {
  /**
     * @param {Object} props
     * @param {string} props.src The url of the image that failed to load.
     */
  constructor(message, code = null, props = { src: null }) {
    super(message, code, props);
  }
}
export class CaptchaLoadError extends ImageLoadError {}
export class LoginError extends ExtendedError {
  /**
     * @param {Object} props
     * @param {string} [props.clientName] The name of the client that failed to login.
     * @param {string} [props.loggedInClient] Information about the client that is currently logged in.
     */
  constructor(message, code = null, props = { clientName: null, loggedInClient: null }) {
    super(message, code, props);
  }
}

export class TabError extends ExtendedError {
  /**
     * @param {Object} props
     * @param {number} props.tabId The ID of the tab which had an error.
     */
  constructor(message, code = null, props = { tabId: null }) {
    super(message, code, props);
  }
}
export class ExecuteScriptError extends ExtendedError {
  /**
     * @param {Object} props
     * @param {number} props.tabId The ID of the tab to which an attempt was made to execute a script.
     */
  constructor(message, code = null, props = { tabId: null }) {
    super(message, code, props);
  }
}
export class SendMessageError extends ExtendedError {
  /**
     * @param {Object} props
     * @param {number} props.tabId The ID of the tab to which sending a message failed.
     */
  constructor(message, code = null, props = { tabId: null }) {
    super(message, code, props);
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
