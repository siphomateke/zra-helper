import { Validator, Rules, VerifyResult } from 'vee-validate';
import { objKeysExact } from '@/utils';

type ValidationResults<T> = { [key in keyof T]?: VerifyResult };

type ValidationRules = { [field: string]: string | Rules };

/**
 * TODO: TypeScript: Make sure obj, validationRules and the returned object all have the same keys.
 * @returns Validation results by field name or all validation errors if `errorsOnly` is `true`.
 */
// eslint-disable-next-line import/prefer-default-export
export async function validateObject<
  R extends ValidationRules,
  T extends boolean
>(
  validator: Validator,
  obj: any,
  validationRules: R,
  errorsOnly: T,
): Promise<T extends true ? string[] : ValidationResults<R>>;
export async function validateObject<R extends ValidationRules>(
  validator: Validator,
  obj: any,
  validationRules: R
): Promise<ValidationResults<R>>;
export async function validateObject<R extends ValidationRules>(
  validator: Validator,
  obj: any,
  validationRules: R,
  errorsOnly: boolean = false
): Promise<ValidationResults<R> | string[]> {
  // FIXME: Make sure using `objKeysExact` isn't a mistake here.
  const properties = objKeysExact(validationRules);
  const validationResults: ValidationResults<R> = {};
  await Promise.all(properties.map(
    prop => validator.verify(obj[prop], validationRules[prop], {
      name: prop,
      values: obj,
    }).then((response) => {
      validationResults[prop] = response;
    }),
  ));
  if (errorsOnly) {
    const validationErrors = [];
    for (const { valid, errors } of Object.values(validationResults)) {
      if (!valid) {
        validationErrors.push(...errors);
      }
    }
    return validationErrors;
  }
  return validationResults;
}

export async function named() {
  const validator = new Validator();
  const response = await validateObject(validator, {}, {
    taxTypeIds: '',
  });
  if (typeof response.taxTypeIds !== 'undefined') {
    response.taxTypeIds.failedRules
  }
}
