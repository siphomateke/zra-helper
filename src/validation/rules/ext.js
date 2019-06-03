import { Validator } from 'vee-validate';
import { ext } from 'vee-validate/dist/rules.esm';
import { joinSpecialLast } from '@/utils';

Validator.extend('ext', {
  getMessage: (field, _params, { validExtensions }) => {
    let message = `The ${field} field must have `;
    if (validExtensions.length === 1) {
      message += `the '${validExtensions[0]}' extension`;
    } else {
      message += `one of the following extensions '${joinSpecialLast(validExtensions, "', '", "' or '")}'`;
    }
    return message;
  },
  validate(files, extensions) {
    const valid = ext.validate(files, extensions);
    return {
      valid,
      data: { validExtensions: extensions },
    };
  },
});
