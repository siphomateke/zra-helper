import { Validator } from 'vee-validate';
import { loadFile } from '@/backend/file_utils';
import { csvOutputParser } from '@/backend/client_actions/pending_liabilities';
import { errorToString } from '@/backend/errors';

// FIXME: Somehow export the parsed output so the file doesn't have to be read twice, once when
// validating and again when actually using the file.
Validator.extend('pendingLiabilitiesFile', {
  getMessage: (_field, _params, { error }) => error,
  validate: async (file) => {
    let valid = false;
    let error = null;
    try {
      const csvString = await loadFile(file);
      csvOutputParser(csvString);
      valid = true;
    } catch (e) {
      error = errorToString(e);
    }
    return {
      valid,
      data: { error },
    };
  },
});
