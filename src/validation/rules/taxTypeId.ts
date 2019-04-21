import { Validator } from 'vee-validate';
import { taxTypeNumericalCodesArray } from '@/backend/constants';

/**
 * Validates a two-digit numerical tax type ID.
 */
export default function validate(value: any): boolean {
  return taxTypeNumericalCodesArray.includes(value);
}

Validator.extend('taxTypeId', {
  getMessage(field) {
    return `The ${field} field must be a two-digit numerical tax type ID.`;
  },
  validate,
});
