import { createClientAction } from '../base';
import { ReturnHistoryRunner, generateDownloadFilename, GetReturnHistoryClientActionOptions } from './base';
import { downloadPage } from '../utils';

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
    createTabPostOptions: {
      url: 'https://www.zra.org.zm/retHist.htm',
      data: {
        actionCode: 'printReceipt',
        flag: 'rtnHistRcpt',
        ackNo: referenceNumber,
        rtnType: taxType,
      },
    },
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
GetAcknowledgementsOfReturnsClientAction.Runner = class extends ReturnHistoryRunner {
  constructor(data) {
    super(data, GetAcknowledgementsOfReturnsClientAction);

    this.downloadItemsTaskTitle = count => `Download ${count} acknowledgement receipt(s)`;
    this.downloadTaxTypeTaskTitle = taxType => `Download ${taxType} acknowledgement receipts`;
    this.downloadFunc = downloadAckReceipt;
  }
};
export default GetAcknowledgementsOfReturnsClientAction;
