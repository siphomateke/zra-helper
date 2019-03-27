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
 * @param {boolean} [getConfig]
 * Whether to resolve the receive config request with an empty object.
 * The config should be explicitly retrieved using `getConfig()` if this is false.
 */
export default function addContentScriptListener(command, handler, getConfig = false) {
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
          } else {
            resolve(response);
          }
        }).catch((error) => {
          resolve({ error: errorToJson(error) });
        });
      }
      if (getConfig && message.command === 'receive_config') {
        resolve({});
      }
    });
  }
  browser.runtime.onMessage.addListener(listener);
}
