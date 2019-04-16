import { getElement, getElementFromDocument } from '@/backend/content_scripts/helpers/elements';
import { parseTable } from '@/backend/content_scripts/helpers/zra';
import addContentScriptListener from '@/backend/content_scripts/helpers/listener';

/**
 * @param {Object} message
 * @param {import('@/backend/client_actions/receipts').ReceiptType} message.type
 * The type of receipt data to get.
 */
async function listener(message) {
  let column = '';
  if (message.type === 'payment') {
    column = '4';
  }
  const mainTable = getElement(
    'form>table>tbody>tr:nth-child(2)>td:nth-child(2)>table:nth-child(1)>tbody',
    'main table',
  );
  const infoTable = getElementFromDocument(
    mainTable,
    `tr:nth-child(5)>td:nth-child(${column})>table>tbody`,
    'info table',
  );
  const registrationDate = getElementFromDocument(
    infoTable,
    'tr:nth-child(2)>td:nth-child(3)',
    'registration date',
  ).innerText;
  const referenceNumber = getElementFromDocument(
    infoTable,
    'tr:nth-child(3)>td:nth-child(3)',
    'reference number',
  ).innerText;

  const data = {
    registrationDate,
    referenceNumber,
  };
  if (message.type === 'payment') {
    const rows = {
      prn: 4,
      paymentDate: 5,
      searchCode: 6,
      paymentType: 7,
    };
    for (const name of Object.keys(rows)) {
      data[name] = getElementFromDocument(
        infoTable,
        `tr:nth-child(${rows[name]})>td:nth-child(3)`,
        name,
      ).innerText;
    }

    const paymentTable = getElement('#pmt_dtl', 'payment table');
    const payments = parseTable({
      root: paymentTable,
      headers: [
        'taxType',
        'accountName',
        'liabilityType',
        'periodFrom',
        'periodTo',
        'chargeYear',
        'chargeQuater',
        'alternativeNumber',
        'amount',
      ],
      recordSelector: 'tbody>tr',
    });
    // exclude 'total payment amount' row
    if (payments.length > 0) {
      payments.pop();
    }
    data.payments = payments;
  }

  return data;
}
addContentScriptListener('get_receipt_data', listener);
