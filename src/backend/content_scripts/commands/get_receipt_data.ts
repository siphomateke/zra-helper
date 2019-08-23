import addContentScriptListener from '@/backend/content_scripts/helpers/listener';
import getDataFromReceipt from '../helpers/receipt_data';

addContentScriptListener('get_receipt_data', async message => getDataFromReceipt(document, message.type));
