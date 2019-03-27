import { getElement } from '@/backend/content_scripts/helpers/elements';
import { getZraError } from '@/backend/content_scripts/helpers/zra';
import addContentScriptListener from '@/backend/content_scripts/helpers/listener';

/**
 * @param {Object} message
 * @param {import('../../utils').IgnoreZraError} message.ignoreZraErrors
 * Whether errors from the ZRA website should be ignored.
 * @param {string} message.selector The selector of the element.
 * @param {string} message.name A descriptive name of the element used when generating errors.
 * For example, "generate report button".
 */
function listener(message) {
  return new Promise((resolve, reject) => {
    try {
      if (!message.ignoreZraErrors) {
        const zraError = getZraError(document);
        if (zraError) {
          throw zraError;
        }
      }
      if (message.selector) {
        // This must be before resolve so we can send back any caught errors.
        const element = getElement(message.selector, message.name);
        resolve();
        element.click();
      } else {
        throw new Error('A selector for an element to be clicked must be provided.');
      }
    } catch (error) {
      reject(error);
    }
  });
}
addContentScriptListener('click_element', listener);
