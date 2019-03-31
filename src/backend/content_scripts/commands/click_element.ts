import { getElement } from '@/backend/content_scripts/helpers/elements';
import { getZraError } from '@/backend/content_scripts/helpers/zra';
import addContentScriptListener from '@/backend/content_scripts/helpers/listener';

addContentScriptListener('click_element', message => {
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
});
