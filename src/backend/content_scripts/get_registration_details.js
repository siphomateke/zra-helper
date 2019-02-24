import { errorToJson } from '../errors';
import { parseTable } from './helpers/zra';
import { getElement } from './helpers/elements';

/**
 * @param {Object} message
 * @param {string} message.command
 */
function listener(message) {
  return new Promise((resolve) => {
    if (message.command === 'getRegistrationDetails') {
      try {
        // eslint-disable-next-line max-len
        const tableSelector = 'fieldset.tab3:nth-child(5)>table:nth-child(2)>tbody:nth-child(1)>tr:nth-child(1)>td:nth-child(1)>table:nth-child(1)';
        const registrationDetailsTable = getElement(tableSelector, 'registration details table');
        const registrationDetails = parseTable({
          root: registrationDetailsTable,
          headers: [
            'srNo',
            'taxType',
            'accountName',
            'effectiveDateOfRegistration',
            'status',
          ],
          recordSelector: 'tr.rcptFont1',
        });
        resolve({
          registrationDetails,
        });
      } catch (error) {
        resolve({ error: errorToJson(error) });
      }
    }
  });
}
browser.runtime.onMessage.addListener(listener);
