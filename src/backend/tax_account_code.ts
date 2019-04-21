import { TaxAccountNameNotFound } from '@/backend/errors';
import createTask from '@/transitional/tasks';
import { taskFunction } from '@/backend/client_actions/utils';
import { xmlRequest } from '@/backend/utils';
import store from '@/store';
import { ReportCode } from './reports';
import { TaxAccountName, TaxAccountCode, TaxTypeNumericalCode } from './constants';
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
  /** The account's code. */
  name: TaxAccountCode;
  /** The account's name. */
  value: TaxAccountName;
}

interface GetAccountCodeTaskFnOptions {
  /** The name of the account whose code we would like to know. */
  accountName: TaxAccountName;
  /** The numerical tax type ID of the account whose code we would like to know. */
  taxTypeId: TaxTypeNumericalCode;
  parentTaskId: TaskId;
}

/**
 * Gets the code of an account whose name and tax type is known. The reason we would want the code
 * of an account is to generate reports for that account.
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

      // Get the codes and names of all tax accounts that have the specified tax type.
      const response = await xmlRequest({
        url: 'https://www.zra.org.zm/frontController.do?actionCode=RPRTPAJAXCHILDCOMBO',
        method: 'post',
        data: {
          prm_ajaxComboTarget: 'accountName',
          reportCode: ReportCode.PENDING_LIABILITY,
          prm_TaxType: taxTypeId,
        },
      });

      let accountData: AccountData | AccountData[] | undefined = response['request-params'].param;
      let accountNameNotFound: boolean = false;
      if (Array.isArray(accountData)) {
        // If there is more than one tax account with the specified tax type, use the one whose
        // name matches the `accountName` param.
        accountData = accountData.find(account => account.value.toLowerCase() === accountName);
        if (typeof accountData === 'undefined') {
          accountNameNotFound = true;
        }
      } else if (!accountData || accountData.value.toLowerCase() !== accountName) {
        accountNameNotFound = true;
      }
      if (accountNameNotFound) {
        throw new TaxAccountNameNotFound(`Cannot find account with name "${accountName}"`, null, {
          accountName,
        });
      }
      const accountCode = accountData!.name;
      return accountCode;
    },
  });
}
