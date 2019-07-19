import { Validator } from 'vee-validate';
import { arrayHasItems } from '@/utils';
import { narrationTypes, paymentAgainstTypes } from './narration';

/**
 * @typedef {import('./narration').NarrationType} NarrationType
 */

const v = new Validator();

v.extend('oneOf', {
  getMessage(field, options) {
    return `The ${field} field must be one of the following: [ ${options.join(', ')} ].`;
  },
  validate(value, options) {
    if (!Array.isArray(options)) throw new Error('An array of possible values must be passed as the first argument to the oneOf validation rule');
    return options.includes(value);
  },
});

const quarterValidator = 'numeric|between:1,4';
const assessmentNumberValidator = 'numeric|length:14';
const dateValidator = 'date_format:dd/MM/yyyy';
// FIXME: Fix date_format expecting months to start with capital letters.
// E.g. 'Jan' instead of 'jan'.
// const altDateValidator = 'date_format:dd-MMM-yyyy';
const altDateValidator = '';
const amountValidator = 'decimal:2';
const prnValidator = 'numeric|length:12';
const receiptNumberValidator = 'numeric|length:7';

const t = narrationTypes;
/** @type {Object.<NarrationType, Object.<string, string>>} */
export const narrationTypeValidators = {
  [t.TARPS_BALANCE]: {
    date: `required|${dateValidator}`,
  },
  [t.ADVANCE_PAYMENT]: {
    advanceFrom: 'required',
    refPrn: `required|${prnValidator}`,
    paymentDate: `required|${altDateValidator}`,
    fromReceiptNumber: receiptNumberValidator,
    quarter: quarterValidator,
    via: '',
  },
  [t.PAYMENT]: {
    prn: `required|${prnValidator}`,
    against: {
      required: true,
      oneOf: paymentAgainstTypes,
    },
    paymentDate: `required|${altDateValidator}`,
    fromReceiptNumber: receiptNumberValidator,
    quarter: quarterValidator,
    via: '',
    assessmentNumber: assessmentNumberValidator,
    againstAssessment: '',
  },
  [t.CLOSING_BALANCE]: {
    fromDate: `required|${dateValidator}`,
    toDate: `required|${dateValidator}`,
  },
  [t.LATE_PAYMENT_PENALTY]: {
    assessmentNumber: assessmentNumberValidator,
  },
  [t.LATE_PAYMENT_INTEREST]: {
    assessmentNumber: assessmentNumberValidator,
  },
  [t.LATE_RETURN_PENALTY]: {},
  [t.PROVISIONAL_RETURN]: {
    fromDate: `required|${dateValidator}`,
    toDate: `required|${dateValidator}`,
    quarter: `required|${quarterValidator}`,
  },
  [t.REVISED_PROVISIONAL_RETURN]: {
    fromDate: `required|${dateValidator}`,
    toDate: `required|${dateValidator}`,
    quarter: `required|${quarterValidator}`,
  },
  [t.ORIGINAL_RETURN]: {},
  [t.SUPPLEMENTARY_RETURN]: {},
  [t.AMENDED_RETURN]: {},
  [t.AUDIT_ASSESSMENT]: {
    assessmentNumber: `required|${assessmentNumberValidator}`,
  },
  [t.ADDITIONAL_ASSESSMENT]: {
    assessmentNumber: `required|${assessmentNumberValidator}`,
  },
  [t.ESTIMATED_ASSESSMENT]: {
    assessmentNumber: `required|${assessmentNumberValidator}`,
  },
  [t.AUDIT_ASSESSMENT_PENALTY]: {},
  [t.ADDITIONAL_ASSESSMENT_PENALTY]: {
    amount: `required|${amountValidator}`,
    fromDate: `required|${dateValidator}`,
    toDate: `required|${dateValidator}`,
  },
  [t.BEING_PENALTY_UNDER_ESTIMATION_PROVISIONAL_TAX]: {
    amount: `required|${amountValidator}`,
    fromDate: `required|${altDateValidator}`,
    toDate: `required|${altDateValidator}`,
  },
  [t.AMENDED_ASSESSMENT]: {
    assessmentNumber: `required|${assessmentNumberValidator}`,
  },
  [t.PENALTY_FOR_AMENDED_ASSESSMENT]: {},
  [t.REFUND_OFFSET]: {
    prn: `required|${prnValidator}`,
    fromDate: `required|${altDateValidator}`,
    toDate: `required|${altDateValidator}`,
  },
  [t.REFUND_PAID]: {},
  [t.BEING_POSTING_OPENING_BALANCE_MIGRATED]: {
    num1: 'required|numeric|length:8',
    num2: 'required|numeric|length:3',
  },
  [t.BEING_REVERSAL_DUPLICATE_PAYMENT]: {
    period: 'required|date_format:MMMM yyyy',
    receiptNumber: `required|${receiptNumberValidator}`,
  },
  [t.BEING_REVERSAL_REPLICATED_TRANSACTION]: {
    period: 'required|date_format:MMMM yyyy',
  },
};

/**
 * @typedef {Object} ValidateParsedNarrationResult
 * @property {boolean} valid
 * @property {string[]} errors Validation errors.
 */

/**
 * Validates parsed narration metadata.
 * @param {import('./narration').ParsedNarrationType} parsed
 * @returns {Promise.<ValidateParsedNarrationResult>}
 */
export default async function validateParsedNarration({ type, meta }) {
  const validationErrors = [];
  if (type === null) {
    validationErrors.push('Narration type could not be determined');
  } else if (type in narrationTypeValidators) {
    const validators = narrationTypeValidators[type];
    const properties = Object.keys(validators);

    // TODO: Treat properties that are not currently required according to their required_if rule
    // as extra properties.
    const { missing: extraProperties } = arrayHasItems(properties, Object.keys(meta));
    if (extraProperties.length > 0) {
      validationErrors.push(`Invalid metadata properties: [ ${extraProperties.join(',')} ]`);
    }

    await Promise.all(properties.map(
      prop => v.verify(meta[prop], validators[prop], {
        name: prop,
        values: meta,
      }).then(({ valid, errors }) => {
        if (!valid) {
          validationErrors.push(...errors);
        }
      }),
    ));
  } else {
    validationErrors.push(`No validator for narration type ${type} found`);
  }
  return {
    valid: validationErrors.length === 0,
    errors: validationErrors,
  };
}
