import { getElementFromDocument } from './elements';
import { parseTable } from './zra';
import { ReceiptType } from '@/backend/client_actions/receipts';
import { objKeysExact } from '@/utils';

interface ReceiptData {
  registrationDate: string;
  referenceNumber: string;
}

interface PaymentReceiptPayment {
  taxType: string;
  accountName: string;
  liabilityType: string;
  periodFrom: string;
  periodTo: string;
  chargeYear: string;
  chargeQuater: string;
  alternativeNumber: string;
  amount: string;
}

export interface PaymentReceiptData extends ReceiptData {
  prn: string;
  paymentDate: string;
  searchCode: string;
  paymentType: string;
  payments: PaymentReceiptPayment[];
}

export interface AcknowledgementReceiptData {
  provisional: boolean;
}

// FIXME: Force keys to be `ReceiptType`
export interface GetDataFromReceiptResponses {
  payment: PaymentReceiptData;
  ack_receipt: AcknowledgementReceiptData;
}

export default function getDataFromReceipt<T extends ReceiptType>(
  root: HTMLDocument | HTMLElement,
  type: T,
): GetDataFromReceiptResponses[T] {
  // TODO: Consider not forcing TS to think this has all the expected properties. It might be
  // risky assuming the correct receipt type is always passed.
  const data: GetDataFromReceiptResponses[T] = {} as GetDataFromReceiptResponses[T];
  if (type === 'payment') {
    // TODO: Update payment receipt parsing
    const mainTable = getElementFromDocument(
      root,
      'form>table>tbody>tr:nth-child(2)>td:nth-child(2)>table:nth-child(1)>tbody',
      'main table',
    );
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
    // FIXME: Restrict keys to keys of `PaymentReceiptData` without allowing undefined non-defined keys.
    const rows = {
      prn: 4,
      paymentDate: 5,
      searchCode: 6,
      paymentType: 7,
    };
    for (const name of objKeysExact(rows)) {
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
    // Tax type in the format: '<TAX TYPE NAME> Individual Provisional'
    // E.g. "Income Tax Individual Provisional"
    const taxType = getElementFromDocument(
      root,
      '.page-body h5',
      'tax type',
    ).innerText.toLowerCase();
    /*
    Possible tax types include:
    - individual provisional

    FIXME: Find v2 version of these names
    - IT Individual
    - IT Non Individual
    - IT Partnership
    */
    data.provisional = taxType.includes('individual provisional');
  }

  return data;
}
