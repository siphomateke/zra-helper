import { TaxAccountCodeNotFound } from '@/backend/errors';
import createTask from '@/transitional/tasks';
import { taskFunction, getTaxTypeIdFromAccountName } from '@/backend/client_actions/utils';
import { getDocumentByAjax } from '@/backend/utils';
import store from '@/store';
import {
  TaxAccountName, TaxAccountCode, TaxTypeNumericalCode, ZraDomain,
} from './constants';
import { TaskId } from '@/store/modules/tasks';

/**
 * Removes client information from a tax account name.
 * @return Anonymized account name.
 */
export function getAnonymousAccountName(accountName: TaxAccountName): string {
  // Remove client name from account name
  return accountName.replace(/.+?-/, '');
}

interface AccountData {
  code: TaxAccountCode;
  accountName: TaxAccountName;
}

interface GetAccountCodeFnOptions {
  /** The name of the account whose code we would like to know. */
  accountName: TaxAccountName;
  /** The numerical tax type ID of the account whose code we would like to know. */
  taxTypeId: TaxTypeNumericalCode;
}

interface GetAccountCodeTaskFnOptions extends GetAccountCodeFnOptions {
  parentTaskId: TaskId;
}

/**
 * Gets the code of an account whose name and tax type is known. The reason we would want the code
 * of an account is to generate reports for that account.
 * @returns The account code.
 */
export async function getTaxAccountCode({
  accountName,
  taxTypeId,
}: GetAccountCodeFnOptions): Promise<TaxAccountCode> {
  // Get the codes and names of all tax accounts that have the specified tax type.
  const doc = await getDocumentByAjax({
    url: `${ZraDomain}/returns/filedReturns`,
    method: 'post',
  });

  const optionEls = doc.querySelectorAll<HTMLOptionElement>('select[name="taxAccountId"] option');
  const accountCodes = [];
  optionEls.forEach((option) => {
    const accountName = option.innerText.toLowerCase();
    accountCodes.push({
      code: option.value,
      accountName,
      taxTypeId: getTaxTypeIdFromAccountName(accountName),
    });
  });

  const accountData: AccountData = accountCodes.find(account => account.taxTypeId === taxTypeId);
  if (typeof accountData === 'undefined') {
    throw new TaxAccountCodeNotFound(`Cannot find the code for the tax type ID "${taxTypeId}"`, null, {
      taxTypeId,
    });
  }
  return accountData.code;
}

/**
 * Creates a task to get the code of an account whose name and tax type is known. The reason we
 * would want the code of an account is to generate reports for that account.
 * @returns The account code.
 */
export default async function getAccountCodeTask({
  accountName,
  taxTypeId,
  parentTaskId,
}: GetAccountCodeTaskFnOptions): Promise<TaxAccountCode> {
  const task = await createTask(store, {
    title: `Determine ID of account: "${accountName}"`,
    anonymousTitle: `Determine ID of account: ${getAnonymousAccountName(accountName)}`,
    parent: parentTaskId,
    unknownMaxProgress: false,
    progressMax: 1,
  });
  return taskFunction({
    task,
    async func() {
      task.status = 'Getting tax account information';
      return getTaxAccountCode({ accountName, taxTypeId });
    },
  });
}
