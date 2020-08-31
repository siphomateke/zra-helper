import { createClientAction } from '../base';
import {
  ReturnHistoryDownloadRunner,
  generateDownloadFilename,
  GetReturnHistoryClientActionOptions,
  ReturnHistoryDownloadFn,
} from './base';
import { downloadPage } from '../utils';
import { ZraDomain } from '@/backend/constants';
import { getDocumentByAjax } from '@/backend/utils';

const downloadReturn: ReturnHistoryDownloadFn = async function downloadReturn({
  taxReturn,
  client,
  taxType,
  parentTaskId,
}) {
  const referenceNumber = taxReturn.referenceNo;

  const url = `${ZraDomain}/returns/view/${referenceNumber}`;
  const returnDoc = await getDocumentByAjax({ url, method: 'get' });

  // Modify styles so only the return details are shown and are formatted correctly.
  const style = document.createElement('style');
  style.innerHTML = `
  /* page loader, navbar, sidebar */
  .theme-loader, .navbar.header-navbar, .pcoded-navbar { display: none !important; }
  /* content wrapper */
  .pcoded-main-container {margin-top:0 !important;}
  .card fieldset {margin-bottom:2em !important;}
  .pcoded-inner-content {padding:0 !important;}
  .page-wrapper {padding:1rem !important;}
  `;
  returnDoc.head.append(style);

  return downloadPage({
    filename: generateDownloadFilename({
      type: 'return',
      client,
      taxType,
      taxReturn,
    }),
    taskTitle: `Download return ${referenceNumber}`,
    parentTaskId,
    htmlDocument: returnDoc,
    htmlDocumentUrl: url,
    // FIXME: Force open in tab so JavaScript loads?
    // If we don't want to load JS, we can get instead get the required period, reference and
    // return type from the HTMLDocument. They are added as the following JS variables:
    // periodStartDate, periodEndDate, returnKey
  });
};

/**
 * Action to download tax returns.
 */
const GetReturnsClientAction = createClientAction({
  ...GetReturnHistoryClientActionOptions,
  id: 'getReturns',
  name: 'Get returns',
});
GetReturnsClientAction.Runner = class extends ReturnHistoryDownloadRunner {
  constructor() {
    super(GetReturnsClientAction, {
      downloadItemsTaskTitle: count => `Download ${count} return(s)`,
      downloadTaxTypeTaskTitle: taxType => `Download ${taxType} returns`,
      downloadFunc: downloadReturn,
    });
  }
};
export default GetReturnsClientAction;
