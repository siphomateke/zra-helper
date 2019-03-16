import { checkLogin } from '@/backend/content_scripts/helpers/check_login';
import addContentScriptListener from '@/backend/content_scripts/helpers/listener';

/**
 * @param {Object} message
 * @param {import('@/backend/constants').Client} message.client
 */
async function listener(message) {
  return checkLogin(document, message.client);
}
addContentScriptListener('check_login', listener);
