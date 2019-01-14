import { errorToJson, TaxTypeNotFoundError } from '../errors';
import { getElement } from './helpers/elements';
import { getZraError } from './helpers/zra';

/**
 * @param {Object} message
 * @param {string} message.command
 * @param {import('../constants').TaxTypeNumericalCode} message.taxTypeId
 */
function listener(message) {
  return new Promise((resolve) => {
    if (message.command === 'generateReport') {
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
        const generateButtonSelector = 'body>table>tbody>tr:nth-child(2)>td>table>tbody>tr>td>form>table>tbody>tr>td>table>tbody>tr:nth-child(2)>td>input:nth-child(1)';
        /** @type {HTMLButtonElement} */
        const generateButton = getElement(generateButtonSelector, 'generate report button');
        resolve({});
        generateButton.click();
      } catch (error) {
        resolve({ error: errorToJson(error) });
      }
    }
  });
}
browser.runtime.onMessage.addListener(listener);
