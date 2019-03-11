import addContentScriptListener from '@/backend/content_scripts/helpers/listener';
import { getElement } from '../helpers/elements';
import { TaxAccountNameNotFound } from '@/backend/errors';

/**
 * Finds the option whose title is accountName and returns its value.
 * @param {string} accountName
 */
function getAccountCode(accountName) {
  // TODO: Use helper function for querySeletorAll. Like getElements
  const availableOptions = document.querySelectorAll('#prm_acntName>option');
  let accountCode = null;
  if (availableOptions.length > 0) {
    for (const option of availableOptions) {
      if (option.title.toLowerCase() === accountName) {
        accountCode = option.value;
        break;
      }
    }
  }
  return accountCode;
}

/**
 * @param {Object} message
 * @param {string} message.accountName
 * @param {string} message.fromDate
 * @param {string} message.toDate
 */
function listener({ accountName, fromDate, toDate }) {
  return new Promise((resolve, reject) => {
    try {
      const accountCode = getAccountCode(accountName);
      if (accountCode !== null) {
        const accountSelect = getElement('#prm_acntName');
        accountSelect.value = accountCode;
        const dateFromInput = getElement('#prm_Dtfrom');
        dateFromInput.value = fromDate;
        const dateToInput = getElement('#prm_Dtto');
        dateToInput.value = toDate;

        const generateButton = getElement('[name="GenerateReport"]', 'generate report button');
        resolve({
          accountCode,
        });
        generateButton.click();
      } else {
        throw new TaxAccountNameNotFound('Cannot find account name', null, { accountName });
      }
    } catch (error) {
      reject(error);
    }
  });
}
addContentScriptListener('generate_tax_payer_ledger', listener);
