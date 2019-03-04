import { TaxTypeNotFoundError } from '@/backend/errors';
import { getElement } from '@/backend/content_scripts/helpers/elements';
import { getZraError } from '@/backend/content_scripts/helpers/zra';
import addContentScriptListener from '@/backend/content_scripts/helpers/listener';

/**
 * @param {Object} message
 * @param {import('@/backend/constants').TaxTypeNumericalCode} message.taxTypeId
 */
function listener(message) {
  return new Promise((resolve, reject) => {
    try {
      const optionValue = message.taxTypeId;
      const optionExists = document.querySelector(`#prm_TaxType>option[value="${optionValue}"]`) != null;
      if (optionExists) {
        document.querySelector('#prm_TaxType').value = optionValue;
      } else {
        const zraError = getZraError(document);
        if (zraError) {
          throw zraError;
        } else {
          throw new TaxTypeNotFoundError(`Tax type with id "${optionValue}" not found`, null, {
            taxTypeId: optionValue,
          });
        }
      }
      // eslint-disable-next-line max-len
      const generateButtonSelector = 'body>table>tbody>tr:nth-child(2)>td>table>tbody>tr>td>form>table>tbody>tr>td>table>tbody>tr:nth-child(2)>td>input:nth-child(1)';
      /** @type {HTMLButtonElement} */
      const generateButton = getElement(generateButtonSelector, 'generate report button');
      resolve();
      generateButton.click();
    } catch (error) {
      reject(error);
    }
  });
}
addContentScriptListener('generate_report', listener);
