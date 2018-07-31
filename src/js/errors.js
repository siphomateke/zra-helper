export class ExtendedError extends Error {
    constructor(message, code, type) {
        super(message);
        this.code = code;
        this.type = type ? type : this.constructor.name;
        this.name = this.type;
    }
    /**
     * Creates an ExtendedError from a JSON representation of one
     * 
     * @param {ExtendedErrorJson} json 
     * @returns {ExtendedError}
     */
    static fromJSON(json) {
        return new ExtendedError(json.message, json.code, json.type);
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
        };
    }
}

export class ZraError extends ExtendedError {}
export class TaxTypeNotFoundError extends ExtendedError {}
export class ElementNotFoundError extends ExtendedError {}
export class LoginError extends ExtendedError {}
export class TabError extends ExtendedError {}

/**
 * @typedef JsonError
 * @property {string} message
 * @property {string} [code]
 * @property {string} [type]
 */

/**
 * @typedef ExtendedErrorJson
 * @property {string} message
 * @property {string} code
 * @property {string} type
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
    if (json.code) {
        output = ExtendedError.fromJSON(json);
    } else {
        output = new Error(json.message);
    }
    return output;
}