import { errorToJson } from '../errors';

/**
 * @param {Object} message
 * @param {string} message.command
 * @param {string} message.html
 */
function listener(message) {
  return new Promise((resolve) => {
    if (message.command === 'injectForm') {
      try {
        document.body.innerHTML = message.html;
        document.getElementById('zra-helper-post-form').submit();
        resolve({});
      } catch (error) {
        resolve({ error: errorToJson(error) });
      }
    }
  });
}
browser.runtime.onMessage.addListener(listener);
