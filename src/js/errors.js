export class ExtendedError extends Error {
    constructor(message, code=null, props={}) {
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

export class ZraError extends ExtendedError {}
export class TaxTypeNotFoundError extends ExtendedError {}
export class ElementNotFoundError extends ExtendedError {}
export class ImageLoadError extends ExtendedError {
    /** 
     * @param {object} props
     * @param {string} props.src The url of the image that failed to load 
     */
    constructor(message, code, props) {
        super(message, code, props);
    }
}
export class CaptchaLoadError extends ImageLoadError {}
export class LoginError extends ExtendedError {}

export class TabError extends ExtendedError {}
export class ExecuteScriptError extends ExtendedError {}
export class SendMessageError extends ExtendedError {}

/**
 * @typedef JsonError
 * @property {string} message
 * @property {string} [code]
 * @property {string} [type]
 * @property {object} [props]
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
    } else {
        return null;
    }
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