export class ExtendedError extends Error {
    constructor(message, code, type) {
        super(message);
        this.code = code;
        this.type = type ? type : this.constructor.name;
        this.name = this.type;
    }
    static fromJSON(json) {
        return new ExtendedError(json.message, json.code, json.type);
    }
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

export function errorFromJson(json) {
    let output = null;
    if (json.code) {
        output = ExtendedError.fromJSON(json);
    } else {
        output = new Error(json.message);
    }
    return output;
}