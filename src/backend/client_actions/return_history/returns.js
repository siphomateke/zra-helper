import { createClientAction } from '../base';
import { ReturnHistoryRunner, generateDownloadFilename, GetReturnHistoryClientActionOptions } from './base';
import { downloadPage } from '../utils';

/** @type {import('./base').ReturnHistoryDownloadFn} */
function downloadReturn({
  taxReturn, client, taxType, parentTaskId,
}) {
  // Not sure why these tax types are treated differently but the ZRA website had this check.
  const taxTypesFromHistory = ['01', '02', '03', '05', '06', '09', '07', '08', '12'];
  let actionCode;
  if (taxTypesFromHistory.includes(taxType)) {
    actionCode = 'viewFormsDtlFromHistory';
  } else {
    actionCode = 'viewFormsDtl';
  }
  const referenceNumber = taxReturn.referenceNo;
  return downloadPage({
    filename: generateDownloadFilename({
      type: 'return',
      client,
      taxType,
      taxReturn,
    }),
    taskTitle: `Download return ${referenceNumber}`,
    parentTaskId,
    createTabPostOptions: {
      url: 'https://www.zra.org.zm/eRet.htm',
      data: {
        actionCode,
        ackNo: referenceNumber,
        rtnType: taxType,
      },
    },
  });
}

/**
 * Action to download tax returns.
 */
const GetReturnsClientAction = createClientAction({
  ...GetReturnHistoryClientActionOptions,
  id: 'getReturns',
  name: 'Get returns',
});
GetReturnsClientAction.Runner = class extends ReturnHistoryRunner {
  constructor(data) {
    super(data);
    this.storeProxy.actionId = GetReturnsClientAction.id;

    this.downloadItemsTaskTitle = count => `Download ${count} return(s)`;
    this.downloadTaxTypeTaskTitle = taxType => `Download ${taxType} returns`;
    this.downloadFunc = downloadReturn;
  }
};
export default GetReturnsClientAction;
