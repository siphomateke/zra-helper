import { getElementFromDocument } from './elements';
import { parseTable } from './zra';

/**
 * @typedef {'payment'} ReceiptType
 */

/**
 * @typedef {Object} ReceiptData
 * @property {string} registrationDate
 * @property {string} referenceNumber
 */

/**
* @typedef {Object} PaymentReceiptData_Temp
* @property {import('@/backend/client_actions/payment_history').PaymentReceiptData[]} payments
* @typedef {ReceiptData & PaymentReceiptData_Temp} PaymentReceiptData
*/
/**
 * @param {HTMLDocument|HTMLElement} root
 * @param {ReceiptType} type
 * @returns {ReceiptData | PaymentReceiptData}
 */
export default function getDataFromReceipt(root, type) {
  let column = '';
  if (type === 'payment') {
    column = '4';
  }
  const mainTable = getElementFromDocument(
    root,
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
  if (type === 'payment') {
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

    const paymentTable = getElementFromDocument(root, '#pmt_dtl', 'payment table');
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