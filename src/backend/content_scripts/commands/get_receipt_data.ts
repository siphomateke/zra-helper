import addContentScriptListener from '@/backend/content_scripts/helpers/listener';
import getDataFromReceipt from '../helpers/receipt_data';

/**
 * @param {Object} message
 * @param {import('../helpers/receipt_data').ReceiptType} message.type
 * The type of receipt data to get.
 */
async function listener(message) {
  return getDataFromReceipt(document, message.type);
}
addContentScriptListener('get_receipt_data', listener);
