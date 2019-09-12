import { Validator, Rules } from 'vee-validate';
import { joinSpecialLast } from '@/utils';

const { ext } = Rules;

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
