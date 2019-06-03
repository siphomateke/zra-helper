import Papa from 'papaparse';
import { Validator } from 'vee-validate';

export default function parseAndValidateLoginDetails(value) {
  let valid = true;
  const errors = [];
  const data = {
    name: '',
    username: '',
    password: '',
  };
  if (value) {
    const parsed = Papa.parse(value);
    if (parsed.errors.length > 0) {
      valid = false;
      errors.push(...parsed.errors.map(error => error.message));
    } else {
      const fields = parsed.data[0];
      if (fields.length === 2 || fields.length === 3) {
        if (fields.length === 2) {
          [data.username, data.password] = fields;
        } else {
          [data.name, data.username, data.password] = fields;
        }
        if (data.username.length === 0 || data.password.length === 0) {
          valid = false;
          if (data.username.length === 0 && data.password.length === 0) {
            errors.push('Username and password must not be blank.');
          } else if (data.username.length === 0) {
            errors.push('Username must not be blank.');
          } else if (data.password.length === 0) {
            errors.push('Password must not be blank.');
          }
        }
      } else {
        valid = false;
        if (fields.length > 3) {
          errors.push('Too many fields.');
        } else {
          errors.push('Too few fields. Must contain at least a username and password separated by a tab or a comma.');
        }
      }
    }
  }
  return {
    valid,
    data,
    errors,
  };
}

Validator.extend('loginDetails', {
  getMessage: (_field, _params, { errors }) => errors.join(','),
  validate: (value) => {
    const validation = parseAndValidateLoginDetails(value);
    return {
      valid: validation.valid,
      data: { errors: validation.errors },
    };
  },
});
