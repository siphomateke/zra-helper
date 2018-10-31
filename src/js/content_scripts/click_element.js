import { errorToJson } from '../errors';
import { getElement } from './helpers/elements';

browser.runtime.onMessage.addListener(message => new Promise((resolve) => {
  if (message.command === 'click') {
    try {
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
}));
