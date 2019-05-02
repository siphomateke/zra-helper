import addContentScriptListener from '@/backend/content_scripts/helpers/listener';
import { getDataFromReceipt } from '@/backend/client_actions/receipts';

/**
 * @param {Object} message
 * @param {import('@/backend/client_actions/receipts').ReceiptType} message.type
 * The type of receipt data to get.
 */
async function listener(message) {
  return getDataFromReceipt(document, message.type);
}
addContentScriptListener('get_receipt_data', listener);
