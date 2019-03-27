import { Validator } from 'vee-validate';
import { validateClientUsername, validateClientPassword } from '@/backend/client_file_reader';
import { clientPropValidationErrorMessages } from '@/backend/constants';

function getErrorMessageFromCode(code) {
  if (code in clientPropValidationErrorMessages) {
    return clientPropValidationErrorMessages[code];
  }
  return 'Unknown error';
}

/**
 *
 * @param {'username'|'password'} prop
 * @returns {import('vee-validate').Rule}
 */
function clientPropertyValidator(prop) {
  return {
    getMessage: (_field, _params, validationErrorCodes) => {
      const errors = validationErrorCodes.map(code => getErrorMessageFromCode(code));
      return errors.join(',');
    },
    validate: (value) => {
      let validation;
      if (prop === 'username') {
        validation = validateClientUsername(value);
      } else {
        validation = validateClientPassword(value);
      }
      return {
        valid: validation.valid,
        data: validation.errors,
      };
    },
  };
}

Validator.extend('clientUsername', clientPropertyValidator('username'));
Validator.extend('clientPassword', clientPropertyValidator('password'));
