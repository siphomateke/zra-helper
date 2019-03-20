import { TaxAccountNameNotFound } from '@/backend/errors';
import createTask from '@/transitional/tasks';
import { taskFunction } from '@/backend/client_actions/utils';
import { getDocumentByAjax } from '@/backend/utils';
import store from '@/store';

/**
 * Finds the option whose title is accountName and returns its value.
 *
 * This must be run on the tax payer ledger report generation page.
 * @param {Object} options
 * @param {Document|Element} options.root Document or Element to search for elements in.
 * @param {string} options.accountName
 * @returns {string} The account code.
 */
export function findAccountCodeFromName({ root, accountName }) {
  // FIXME: Use helper function for querySeletorAll. Like getElements
  const availableOptions = root.querySelectorAll('#prm_acntName>option');
  let accountCode = null;
  if (availableOptions.length > 0) {
    for (const option of availableOptions) {
      if (option.title.toLowerCase() === accountName) {
        accountCode = option.value;
        break;
      }
    }
  }
  if (accountCode !== null) {
    return accountCode;
  }
  throw new TaxAccountNameNotFound('Cannot find account name', null, { accountName });
}

/**
 * Removes client information from a tax account name.
 * @param {string} accountName
 * @return {string} Anonymized account name.
 */
export function getAnonymousAccountName(accountName) {
  // Remove client name from account name
  return accountName.replace(/.+?-/, '');
}

/**
 * Gets the code of an account whose name is known. The reason we would want the code of an account
 * is to generate reports for that account.
 *
 * The page that is used to generate tax payer ledger reports contains an account name dropdown.
 * The values of the options in this dropdown are the codes of the accounts. This function gets the
 * code of an account by searching for the option whose title is the provided account name.
 * @param {Object} options
 * @param {string} options.accountName The name of the account whose code we would like to know.
 * @param {number} options.parentTaskId
 */
export async function getAccountCodeTask({ accountName, parentTaskId }) {
  const task = await createTask(store, {
    title: `Determine ID of account: "${accountName}"`,
    anonymousTitle: `Determine ID of account: ${getAnonymousAccountName(accountName)}`,
    parent: parentTaskId,
    unknownMaxProgress: false,
    progressMax: 2,
  });
  return taskFunction({
    task,
    async func() {
      task.status = 'Getting tax payer ledger report generator';
      const doc = await getDocumentByAjax({
        // eslint-disable-next-line max-len
        url: 'https://www.zra.org.zm/reportController.htm?actionCode=taxPayerLedgerDetails',
      });

      task.addStep('Getting account code');
      const accountCode = await findAccountCodeFromName({
        root: doc,
        accountName,
      });
      return accountCode;
    },
  });
}
