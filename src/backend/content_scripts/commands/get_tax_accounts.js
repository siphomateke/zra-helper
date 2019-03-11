import { parseTable } from '@/backend/content_scripts/helpers/zra';
import { getElement } from '@/backend/content_scripts/helpers/elements';
import addContentScriptListener from '@/backend/content_scripts/helpers/listener';

/**
 * @param {Object} message
 * @param {string[]} message.columns
 */
async function listener(message) {
  // eslint-disable-next-line max-len
  const tableSelector = 'fieldset.tab3:nth-child(5)>table:nth-child(2)>tbody:nth-child(1)>tr:nth-child(1)>td:nth-child(1)>table:nth-child(1)';
  const registrationDetailsTable = getElement(tableSelector, 'registration details table');
  const taxAccounts = parseTable({
    root: registrationDetailsTable,
    headers: message.columns,
    recordSelector: 'tr.rcptFont1',
  });
  return { taxAccounts };
}
addContentScriptListener('get_tax_accounts', listener);
