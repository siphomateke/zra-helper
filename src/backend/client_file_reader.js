import Papa from 'papaparse';
import log from '@/transitional/log';
import { clientPropValidationErrors } from '@/backend/constants';
import { loadFile, getExtension } from './file_utils';

/**
 * @typedef {Object} LoadedClient
 * @property {string} name
 * @property {string} username
 * @property {string} password
 */

/**
 * @typedef {import('@/backend/constants').ParsedClient} ParsedClient
 * @typedef {import('@/backend/constants').ClientValidationError} ClientValidationError
 */

/**
 * @typedef ClientValidationResult
 * @property {boolean} valid True if the client is valid
 * @property {string[]} [errors] An array of errors that will be set when the client is invalid
 * @property {Object.<string, ClientValidationError[]>} [propErrors] List of errors per property.
 */

export function validateClientUsername(tpin) {
  const response = {
    valid: true,
    errors: [],
  };
  if (!(/\d{10}/.test(tpin) && tpin.length === 10)) {
    response.valid = false;
    response.errors.push(clientPropValidationErrors.TPIN_SHORT);
  }
  return response;
}

export function validateClientPassword(password) {
  const response = {
    valid: true,
    errors: [],
  };
  if (password.length < 8) {
    response.valid = false;
    response.errors.push(clientPropValidationErrors.PASSWORD_SHORT);
  }
  return response;
}

/**
 * Checks if a client is valid
 *
 * The following validation rules are used on the client:
 * - has a name, username and password
 * - username is a 10 digit number
 * - password is at least 8 characters long
 *
 * @param {LoadedClient} client The client to validate
 * @returns {ClientValidationResult}
 */
function validateClient(client) {
  /** Properties that must exist on each client */
  const requiredProps = ['name', 'username', 'password'];
  const propErrors = {};
  const missingProps = [];
  for (const prop of requiredProps) {
    propErrors[prop] = [];
    if (!client[prop]) {
      missingProps.push(prop);
      propErrors[prop].push(clientPropValidationErrors.MISSING);
    }
  }
  const validationErrors = [];
  if (missingProps.length > 0) {
    const missingString = `[${missingProps.join(', ')}]`;
    validationErrors.push(`Properties missing: ${missingString}`);
  }
  if (!missingProps.includes('username')) {
    const validationResult = validateClientUsername(client.username);
    if (!validationResult.valid) {
      validationErrors.push(...validationResult.errors);
      propErrors.username.push(...validationResult.errors);
    }
  }
  if (!missingProps.includes('password')) {
    const validationResult = validateClientPassword(client.password);
    if (!validationResult.valid) {
      validationErrors.push(...validationResult.errors);
      propErrors.password.push(...validationResult.errors);
    }
  }
  return {
    valid: validationErrors.length === 0,
    errors: validationErrors,
    propErrors,
  };
}

/**
 * Gets an array of clients from a csv string
 *
 * @param {string} csvString The CSV to parse as a string
 * @param {Papa.ParseConfig} config CSV parsing config
 * @returns {ParsedClient[]}
 */
function getClientsFromCsv(csvString, config = {}) {
  const list = [];

  log.setCategory('getClientList');
  log.log('Parsing CSV');
  const parseConfig = Object.assign({
    header: true,
    trimHeaders: true,
    skipEmptyLines: true,
  }, config);
  const parsed = Papa.parse(csvString, parseConfig);

  /**
   * Converts a row index (from Papa.parse) to a line number
   *
   * @param {number} rowIndex
   * @returns {number}
   */
  function toLineNumber(rowIndex) {
    let lineNumber = rowIndex + 1;
    if (parseConfig.header) {
      // Since the headers aren't included in the parsed output,
      // we need to add one to get back to the original line number.
      lineNumber++;
    }
    return lineNumber;
  }

  /**
   * An object whose keys are row numbers and the errors associated with
   * the row numbers are values
   * @type {Object.<string, Papa.ParseError[]>}
   */
  const rowErrors = {};
  for (const error of parsed.errors) {
    if (!Array.isArray(rowErrors[error.row])) {
      rowErrors[error.row] = [];
    }
    rowErrors[error.row].push(error);
  }

  // Output all the row errors
  for (const row of Object.keys(rowErrors)) {
    const errors = rowErrors[row].map(error => `CSV parse error in row ${toLineNumber(error.row)}: ${error.message}`);
    log.showError(errors.join(', '));
  }

  log.log('Finished parsing CSV');

  // Only attempt to parse clients if the number of row errors is less than
  // the number of parsed rows.
  if (Object.keys(rowErrors).length < parsed.data.length) {
    const { fields } = parsed.meta;
    if (Object.keys(rowErrors).length) {
      log.log("Attempting to parse clients in rows that don't have CSV parsing errors");
    } else {
      log.log('Parsing clients');
    }
    for (let i = 0; i < parsed.data.length; i++) {
      // If there was an error parsing this row of the CSV,
      // don't attempt to use it as a client
      if (!rowErrors[i]) {
        const row = parsed.data[i];
        const client = {
          name: row[fields[0]],
          username: row[fields[1]],
          password: row[fields[2]],
        };
        const validationResult = validateClient(client);
        Object.assign(client, validationResult);
        if (validationResult.valid) {
          log.log(`Parsed valid client "${client.name}"`);
        } else {
          const errors = validationResult.errors.join(', ');
          log.showError(`Row ${toLineNumber(i)} is not a valid client: ${errors}`);
        }
        list.push(client);
      }
    }
  } else if (parsed.data.length > 0) {
    // Count the number of rows that have the field mismatch error
    let numberOfFieldMismatchErrors = 0;
    for (const errors of Object.values(rowErrors)) {
      for (const error of errors) {
        if (error.type === 'FieldMismatch') {
          numberOfFieldMismatchErrors++;
          break;
        }
      }
    }

    // If the number of 'FieldMismatch' errors matches the number of data rows,
    // then the header row probably has the wrong number of columns
    if (numberOfFieldMismatchErrors === parsed.data.length) {
      log.log(
        'A large number of field mismatch errors were detected. Make sure that a header with the same number of columns as the rest of the CSV is present.',
        'info',
      );
    }
  }
  log.log(`Parsed ${list.length} valid client(s)`);
  return list;
}

/**
 * Gets clients from a CSV file.
 *
 * @param {File} file The CSV file to get clients from
 * @returns {Promise.<ParsedClient[]>}
 * @throws Will throw an error if the file fails to load
 */
export default async function getClientsFromFile(file) {
  return new Promise((resolve, reject) => {
    const ext = getExtension(file.name);
    if (ext === 'csv') {
      log.setCategory('loadClientListFile');
      log.log(`Loading client list file "${file.name}"`);
      loadFile(file)
        .catch((error) => {
          log.setCategory('loadClientListFile');
          log.showError(`Loading file "${file.name}" failed: ${error}`);
          return Promise.reject(error);
        })
        .then((text) => {
          log.setCategory('loadClientListFile');
          log.log(`Successfully loaded client list file "${file.name}"`);
          return getClientsFromCsv(text);
        })
        .then(resolve)
        .catch(reject);
    } else {
      log.setCategory('loadClientListFile');
      log.showError(`Client list file's extension must be '.csv' not '.${ext}'.`);
      reject(new Error(`InvalidFileExtension: Client list file's extension must be '.csv' not '.${ext}'.`));
    }
  });
}
