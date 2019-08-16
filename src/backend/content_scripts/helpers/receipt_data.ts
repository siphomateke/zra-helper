import { getElementFromDocument } from './elements';
import { parseTable } from './zra';
import { ReceiptType } from '@/backend/client_actions/receipts';
import { PaymentReceiptData } from '@/backend/client_actions/payment_history';

// FIXME: Use TypeScript

interface ReceiptData {
  registrationDate: string;
  referenceNumber: string;
}

// TODO: Rename
interface PaymentReceiptData2 extends ReceiptData {
  payments: PaymentReceiptData[];
}

export interface AcknowledgementReceiptData {
  provisional: boolean;
}

export default function getDataFromReceipt(
  root: HTMLDocument | HTMLElement,
  type: ReceiptType,
): PaymentReceiptData2 | AcknowledgementReceiptData {
  const data = {};

  const mainTable = getElementFromDocument(
    root,
    'form>table>tbody>tr:nth-child(2)>td:nth-child(2)>table:nth-child(1)>tbody',
    'main table',
  );
  if (type === 'payment') {
    const column = '4';
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

    data.registrationDate = registrationDate;
    data.referenceNumber = referenceNumber;
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
  } else if (type === 'ack_receipt') {
    // Tax type in the format: 'Tax Type :  IT Partnership'
    const taxType = getElementFromDocument(
      mainTable,
      'tbody>tr:nth-child(10)>td:nth-child(2)',
      'tax type',
    ).innerText;
    /*
    Possible tax types include:
    - IT Provisional
    - IT Individual
    - IT Non Individual
    - IT Partnership
    */
    data.provisional = taxType.includes('IT Provisional');
  }

  // FIXME: Document return value
  return data;
}
