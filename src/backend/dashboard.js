import $ from 'jquery';
import Papa from 'papaparse';
import pendingLiabilitiesAction from './client_actions/pending_liabilities';
import returnHistoryAction from './client_actions/return_history';
import paymentHistoryAction from './client_actions/payment_history';
import testLoginAction from './client_actions/test_login';
import { allClientsAction } from './client_actions/base';
import { log } from './log';

/**
 * @typedef {import('./constants').Client} Client
 * @typedef {import('./client_actions/base').ClientAction} ClientAction
 */

/** @type {Client[]} */
let clientList = [];

const clientActions = {};

/**
 * @param {ClientAction} action
 */
function addClientAction(action) {
  clientActions[action.id] = action;
}
addClientAction(pendingLiabilitiesAction);
addClientAction(returnHistoryAction);
addClientAction(paymentHistoryAction);
addClientAction(testLoginAction);

$(document).on('submit', '#action-form', (e) => {
  e.preventDefault();
  const data = $('#action-form').serializeArray();
  const actions = [];
  for (const field of data) {
    if (field.name === 'actions') {
      actions.push(field.value);
    }
  }
  for (const id of Object.keys(clientActions)) {
    if (actions.includes(id)) {
      allClientsAction(clientList, clientActions[id]);
    }
  }
});

/**
 * @typedef ClientValidationResult
 * @property {boolean} valid True if the client is valid
 * @property {string[]} [errors] An array of errors that will be set when the client is invalid
 */

/**
 * Checks if a client is valid
 *
 * The following validation rules are used on the client:
 * - has a name, username and password
 * - username is a 10 digit number
 * - password is at least 8 characters long
 *
 * @param {Client} client The client to validate
 * @returns {ClientValidationResult}
 */
function validateClient(client) {
  /** Properties that must exist on each client */
  const requiredProps = ['name', 'username', 'password'];
  const missingProps = [];
  for (const prop of requiredProps) {
    if (!client[prop]) {
      missingProps.push(prop);
    }
  }
  const validationErrors = [];
  if (missingProps.length > 0) {
    const missingString = `[${missingProps.join(', ')}]`;
    validationErrors.push(`Properties missing: ${missingString}`);
  }
  if (!missingProps.includes('username')) {
    const tpin = client.username;
    if (!(/\d{10}/.test(tpin) && tpin.length === 10)) {
      validationErrors.push('TPIN (username) must be a 10 digit number');
    }
  }
  if (!missingProps.includes('password') && client.password.length < 8) {
    validationErrors.push('Password must be at least 8 characters long');
  }
  if (validationErrors.length > 0) {
    return {
      valid: false,
      errors: validationErrors,
    };
  }
  return { valid: true };
}

/**
 * Gets an array of clients from a csv string
 *
 * @param {string} csvString The CSV to parse as a string
 * @param {Papa.ParseConfig} config CSV parsing config
 * @returns {Client[]}
 */
function getClientsFromCsv(csvString, config = {}) {
  const list = [];

  log.setCategory('get_client_list');
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
    log.showError(rowErrors[row].map(error => `CSV parse error in row ${toLineNumber(error.row)}: ${error.message}`).join(', '));
  }

  log.log('Finished parsing CSV');

  // Only attempt to parse clients if the number of row errors is less than
  // the number of parsed rows.
  if (Object.keys(rowErrors).length < parsed.data.length) {
    const fields = parsed.meta.fields;
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
        if (validationResult.valid) {
          log.log(`Parsed valid client "${client.name}"`);
          list.push(client);
        } else {
          const errors = validationResult.errors.join(', ');
          log.showError(`Row ${toLineNumber(i)} is not a valid client: ${errors}`);
        }
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
      log.log('A large number of field mismatch errors were detected. '
            + 'Make sure that a header with the same number of columns as the rest of the CSV is present.', 'info');
    }
  }
  log.log(`Parsed ${list.length} valid client(s)`);
  return list;
}

function getExtension(filename) {
  const split = filename.split('.');
  return split[split.length - 1];
}

/**
 * Gets clients from a CSV file.
 *
 * @param {File} file The CSV file to get clients from
 * @returns {Promise.<Client[]>}
 * @throws Will throw an error if the file fails to load
 */
function getClientsFromFile(file) {
  return new Promise((resolve, reject) => {
    const ext = getExtension(file.name);
    if (ext === 'csv') {
      const fileReader = new FileReader();
      // TODO: Add file load progress
      fileReader.onload = async function onload(fileLoadedEvent) {
        const text = fileLoadedEvent.target.result;
        log.setCategory('load_client_list_file');
        log.log(`Successfully loaded client list file "${file.name}"`);
        resolve(getClientsFromCsv(text));
      };
      fileReader.onerror = function onerror(event) {
        log.setCategory('load_client_list_file');
        log.showError(`Loading file "${file.name}" failed: ${event.target.error}`);
        reject(new Error(event.target.error));
      };
      log.setCategory('load_client_list_file');
      log.log(`Loading client list file "${file.name}"`);
      fileReader.readAsText(file, 'UTF-8');
    } else {
      log.setCategory('load_client_list_file');
      log.showError(`Client list file's extension must be '.csv' not '.${ext}'.`);
    }
  });
}

$('[name="clientList"]').on('input', async (e) => {
  try {
    clientList = await getClientsFromFile(e.target.files[0]);
  } catch (error) {
    // TODO: See if this needs to do anything since errors are already
    // logged in getClientsFromFile
  }
});

// Updates bulma file inputs
$('.file-input').on('input', (e) => {
  const file = e.target.files[0];
  const input = $(e.target);
  input.closest('.file').addClass('has-name');
  const fileLabelEl = input.closest('.file-label');
  let fileNameEl = fileLabelEl.find('.file-name');
  if (!fileNameEl.length) {
    fileNameEl = $('<span class="file-name"></span>');
    fileLabelEl.append(fileNameEl);
  }
  fileNameEl.text(file.name);
});
