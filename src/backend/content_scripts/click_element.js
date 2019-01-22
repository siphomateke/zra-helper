import { errorToJson } from '../errors';
import { getElement } from './helpers/elements';
import { getZraError } from './helpers/zra';

/**
 * @param {Object} message
 * @param {string} message.command
 * @param {import('../utils').IgnoreZraError} message.ignoreZraErrors
 * Whether errors from the ZRA website should be ignored.
 * @param {string} message.selector The selector of the element.
 * @param {string} message.name A descriptive name of the element used when generating errors.
 * For example, "generate report button".
 */
function listener(message) {
  return new Promise((resolve) => {
    if (message.command === 'click') {
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
          resolve({});
          element.click();
        } else {
          throw new Error('A selector for an element to be clicked must be provided.');
        }
      } catch (error) {
        resolve({ error: errorToJson(error) });
      }
    }
  });
}
browser.runtime.onMessage.addListener(listener);
