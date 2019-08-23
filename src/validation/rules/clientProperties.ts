import { Validator, Rule } from 'vee-validate';
import { validateClientUsername, validateClientPassword, ClientPropValidationResult } from '@/backend/client_file_reader';
import { clientPropValidationErrorMessages, ClientPropValidationError } from '@/backend/constants';

function getErrorMessageFromCode(code: ClientPropValidationError): string {
  if (code in clientPropValidationErrorMessages) {
    return clientPropValidationErrorMessages[code];
  }
  return 'Unknown error';
}

function clientPropertyValidator(prop: 'username' | 'password'): Rule {
  return {
    getMessage: (_field, _params, validationErrorCodes: ClientPropValidationError[]) => {
      const errors = validationErrorCodes.map(code => getErrorMessageFromCode(code));
      return errors.join(',');
    },
    validate: (value) => {
      let validation: ClientPropValidationResult;
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
