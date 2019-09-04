import { Validator } from 'vee-validate';
import { taxTypeNumericalCodes } from '@/backend/constants';

/**
 * Validates a two-digit numerical tax type ID.
 * @param {*} value
 * @returns {boolean}
 */
export default function validate(value) {
  return Object.values(taxTypeNumericalCodes).includes(value);
}

Validator.extend('taxTypeId', {
  getMessage(field) {
    return `The ${field} field must be a two-digit numerical tax type ID.`;
  },
  validate,
});
