import { errorToJson } from '@/backend/errors';
import { ContentScriptCommand, ContentScriptMessageFromCommand, ContentScriptResponseFromCommand } from '../commands/types';

/**
 * Adds a message listener that only runs when a particular message is received.
 * Additionally sends back any errors (as JSON) that occur when running the listener.
 * Whether to resolve the receive config request with an empty object.
 * The config should be explicitly retrieved using `getConfig()` if this is false.
 */
export default function addContentScriptListener<
  C extends ContentScriptCommand,
  M extends ContentScriptMessageFromCommand<C>,
  R extends ContentScriptResponseFromCommand<C, M>
>(
  command: C,
  handler: (message: M) => Promise<R>,
  getConfig: boolean = false,
) {
  // FIXME: Update promise return type to be an empty object only if response is not an object.
  function listener(message: M, sender: browser.runtime.MessageSender): Promise<R | object> {
    return new Promise((resolve) => {
      if (sender.id === browser.runtime.id && message.command === command) {
        handler(message)
          .then((response) => {
            if (typeof response !== 'object') {
              resolve({});
            } else {
              resolve(response);
            }
          })
          .catch((error) => {
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
