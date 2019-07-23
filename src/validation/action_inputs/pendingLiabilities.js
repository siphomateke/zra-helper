import { objectHasProperties, validateObjectKeys } from '@/utils';
import { Validator } from 'vee-validate';
import { taxTypeCodes } from '@/backend/constants';
import { pendingLiabilityColumns } from '@/backend/client_actions/pending_liabilities';

/** Validation errors */
const errors = {
  MISSING_PROPERTIES: 'MISSING_PROPERTIES',
  INVALID_TOTALS_TAX_TYPE_CODES: 'INVALID_TOTALS_CODES',
  INVALID_PENDING_LIABILITY_COLUMNS: 'INVALID_PENDING_LIABILITY_COLUMNS',
};

/**
 * @typedef {Object} GenericValidation
 * @property {boolean} valid
 * @property {string} error
 */

/**
 * Validates a pending liability `Totals` object.
 * @see {@link Totals} for what the totals object should look like.
 * @param {*} totals
 * @returns {GenericValidation}
 */
function validateTotalsObject(totals) {
  const { valid } = validateObjectKeys(totals, pendingLiabilityColumns);
  const error = valid ? errors.INVALID_PENDING_LIABILITY_COLUMNS : null;
  return { valid, error };
}

/**
 * Validates a pending liability `TotalsByTaxTypeCode` object.
 * @see {@link TotalsByTaxTypeCode} for what the totals object should look like.
 * @param {*} totalsByTaxTypeCode
 * @returns {GenericValidation}
 */
function validateTotalsByTaxTypeCodeObject(totalsByTaxTypeCode) {
  let error = null;
  const { valid } = validateObjectKeys(totalsByTaxTypeCode, taxTypeCodes);
  if (!valid) {
    error = errors.INVALID_TOTALS_TAX_TYPE_CODES;
  } else {
    for (const totals of Object.values(totalsByTaxTypeCode)) {
      const validation = validateTotalsObject(totals);
      if (!validation.valid) {
        ({ error } = validation);
        break;
      }
    }
  }
  return {
    valid: error === null,
    error,
  };
}

/**
 * @typedef {Object} ClientPendingLiabilityValidation
 * @property {string[]} missingProperties
 * @property {boolean} valid
 * @property {string} error
 */

/**
 * @typedef {Object} ValidationInfo
 * @property {boolean} isArray
 * Whether the obj that should be a list of parsed pending liability outputs was an array.
 * @property {ClientPendingLiabilityValidation[]} validations
 * Validations of each client's parsed pending liability output.
 */

Validator.extend('parsedPendingLiabilitiesOutput', {
  /**
   *
   * @param {*} field
   * @param {*} _params
   * @param {ValidationInfo} data
   */
  getMessage(field, _params, { isArray, validations }) {
    const messages = [];
    if (!isArray) {
      messages.push('It must be an array of the pending liabilities for each client');
    } else {
      /** Errors whose messages only need to be written once rather than per array item. */
      const existingItemValidationErrors = [];
      for (const validation of validations) {
        if (validation.error === errors.MISSING_PROPERTIES) {
          messages.push(`One of the pending liability objects is missing the following properties [ ${validation.missingProperties.join(', ')} ]`);
        } else if (
          validation.error === errors.INVALID_TOTALS_TAX_TYPE_CODES
          || validation.error === errors.INVALID_PENDING_LIABILITY_COLUMNS
        ) {
          existingItemValidationErrors.push(validation.error);
        }
      }
      if (existingItemValidationErrors.includes(errors.INVALID_TOTALS_TAX_TYPE_CODES)) {
        messages.push('Some clients pending liabilities have invalid tax type codes');
      }
      if (existingItemValidationErrors.includes(errors.INVALID_PENDING_LIABILITY_COLUMNS)) {
        messages.push('Some tax types of some pending liabilities have invalid pending liability columns');
      }
    }
    return `The ${field} field is not a valid parsed pending liabilities file; ${messages.join(', ')}`;
  },
  validate(value) {
    let isArray = true;
    let valid = true;
    /** @type {ClientPendingLiabilityValidation[]} */
    const validations = [];
    if (!Array.isArray(value)) {
      isArray = false;
      valid = false;
    } else {
      for (const item of value) {
        let itemError = null;
        const { missing: missingProperties } = objectHasProperties(item, ['client', 'totals']);
        if (missingProperties.length > 0) {
          itemError = errors.MISSING_PROPERTIES;
        } else {
          const validation = validateTotalsByTaxTypeCodeObject(item.totals);
          if (!validation.valid) {
            itemError = validation.error;
          }
        }
        const itemValid = itemError === null;
        if (!itemValid) {
          valid = false;
        }
        validations.push({
          missingProperties,
          valid: itemValid,
          error: itemError,
        });
      }
    }
    return {
      valid,
      data: { isArray, validations },
    };
  },
});
