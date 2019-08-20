import { createClientAction } from '../base';
import { ReturnHistoryDownloadRunner, generateDownloadFilename, GetReturnHistoryClientActionOptions } from './base';
import { downloadPage } from '../utils';

/**
 * @returns {import('@/backend/utils').CreateTabPostOptions}
 */
// TODO: Use TypeScript
export function generateAckReceiptRequest(taxType, referenceNumber) {
  return {
    url: 'https://www.zra.org.zm/retHist.htm',
    data: {
      actionCode: 'printReceipt',
      flag: 'rtnHistRcpt',
      ackNo: referenceNumber,
      rtnType: taxType,
    },
  };
}

/** @type {import('./base').ReturnHistoryDownloadFn} */
function downloadAckReceipt({
  taxReturn, client, taxType, parentTaskId,
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
    createTabPostOptions: generateAckReceiptRequest(taxType, referenceNumber),
  });
}

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
