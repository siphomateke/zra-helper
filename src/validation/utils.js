/**
 * TODO: TypeScript: Make sure obj, validationRules and the returned object all have the same keys.
 * @param {import('vee-validate').Validator} validator
 * @param {Object.<string, any>} obj
 * @param {Object.<string, string|import('vee-validate').Rules>} validationRules
 * @param {boolean} errorsOnly
 * @returns {Promise<Object.<string, import('vee-validate').VerifyResult>|string[]>}
 * Validation results by field name or all validation errors if `errorsOnly` is `true`.
 */
// eslint-disable-next-line import/prefer-default-export
export async function validateObject(validator, obj, validationRules, errorsOnly = false) {
  const properties = Object.keys(validationRules);
  const validationResults = {};
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
