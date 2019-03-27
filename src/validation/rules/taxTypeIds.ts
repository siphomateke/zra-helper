import { Validator } from 'vee-validate';
import validateTaxTypeId from './taxTypeId';

/**
 * Validates an array of two-digit numerical tax type IDs.
 * @param {*} value
 * @returns {boolean}
 */
export default function validate(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!validateTaxTypeId(item)) {
        return false;
      }
    }
    return true;
  }
  return false;
}

Validator.extend('taxTypeIds', {
  getMessage(field) {
    return `The ${field} field must be an array of two-digit numerical tax type IDs.`;
  },
  validate,
});
