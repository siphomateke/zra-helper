import { createClientAction } from '../base';
import {
  ReturnHistoryDownloadRunner,
  generateDownloadFilename,
  GetReturnHistoryClientActionOptions,
  ReturnHistoryDownloadFn,
} from './base';
import { downloadPage } from '../utils';
import { TaxTypeNumericalCode, ReferenceNumber, ZraDomain } from '@/backend/constants';
import { CreateTabRequestOptions } from '@/backend/utils';

export function generateAckReceiptRequest(
  taxType: TaxTypeNumericalCode,
  referenceNumber: ReferenceNumber,
): CreateTabRequestOptions {
  return { url: `${ZraDomain}/returns/view/${referenceNumber}`, method: 'get' };
}

const downloadAckReceipt: ReturnHistoryDownloadFn = function downloadAckReceipt({
  taxReturn,
  client,
  taxType,
  parentTaskId,
}) {
  const referenceNumber = taxReturn.referenceNo;
  return downloadPage({
    filename: generateDownloadFilename({
      type: 'receipt',
      taxReturn,
      client,
      taxType,
    }),
    taskTitle: `Download acknowledgement receipt ${referenceNumber}`,
    parentTaskId,
    downloadUrl: `${ZraDomain}/uploads/returns/acknowledgements/${referenceNumber}.pdf`,
  });
};

/**
 * Action to download acknowledgement receipts of e-Returns
 */
const GetAcknowledgementsOfReturnsClientAction = createClientAction({
  ...GetReturnHistoryClientActionOptions,
  id: 'getAcknowledgementsOfReturns',
  name: 'Get acknowledgements of returns',
});
GetAcknowledgementsOfReturnsClientAction.Runner = class extends ReturnHistoryDownloadRunner {
  constructor() {
    super(GetAcknowledgementsOfReturnsClientAction, {
      downloadItemsTaskTitle: count => `Download ${count} acknowledgement receipt(s)`,
      downloadTaxTypeTaskTitle: taxType => `Download ${taxType} acknowledgement receipts`,
      downloadFunc: downloadAckReceipt,
    });
  }
};
export default GetAcknowledgementsOfReturnsClientAction;
