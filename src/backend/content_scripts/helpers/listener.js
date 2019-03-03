import { errorToJson } from '@/backend/errors';

/**
 * @callback ContentScriptListener
 * @param {Object} message
 * @returns {Promise.<Object>}
 */

/**
 * Adds a message listener that only runs when a partiular message is received.
 * Additionally sends back any errors (as JSON) that occur when running the listener.
 * @param {ContentScriptListener} handler
 */
export default function addContentScriptListener(command, handler) {
  /**
   * @param {Object} message
   * @param {string} message.command
   */
  async function listener(message) {
    return new Promise((resolve) => {
      if (message.command === command) {
        handler(message).then((response) => {
          if (typeof response !== 'object') {
            resolve({});
          }
          resolve(response);
        }).catch((error) => {
          resolve({ error: errorToJson(error) });
        });
      }
    });
  }
  browser.runtime.onMessage.addListener(listener);
}
