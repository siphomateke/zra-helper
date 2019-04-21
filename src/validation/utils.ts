import { Validator, Rules, VerifyResult } from 'vee-validate';

type ValidationResults<T> = { [key in keyof T]?: VerifyResult };

/**
 * TODO: TypeScript: Make sure obj, validationRules and the returned object all have the same keys.
 * @returns Validation results by field name or all validation errors if `errorsOnly` is `true`.
 */
// eslint-disable-next-line import/prefer-default-export
export async function validateObject<
  ValidationRules extends { [field: string]: string | Rules },
  >(
    validator: Validator,
    obj: any,
    validationRules: ValidationRules,
    errorsOnly = false
  ): Promise<ValidationResults<ValidationRules> | string[]> {
  const properties = Object.keys(validationRules);
  const validationResults: ValidationResults<ValidationRules> = {};
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
