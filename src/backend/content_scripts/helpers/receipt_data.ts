import { getElementFromDocument } from './elements';
import { ReceiptType } from '@/backend/client_actions/receipts';

export interface AcknowledgementReceiptData {
  provisional: boolean;
}

// FIXME: Force keys to be `ReceiptType`
export interface GetDataFromReceiptResponses {
  ack_receipt: AcknowledgementReceiptData;
}

export default function getDataFromReceipt<T extends ReceiptType>(
  root: HTMLDocument | HTMLElement,
  type: T,
): GetDataFromReceiptResponses[T] {
  // TODO: Consider not forcing TS to think this has all the expected properties. It might be
  // risky assuming the correct receipt type is always passed.
  const data: GetDataFromReceiptResponses[T] = {} as GetDataFromReceiptResponses[T];
  if (type === 'ack_receipt') {
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
