import { parseReportTable, ParsedReportTable } from './content_scripts/helpers/zra';
import { makeRequest, parseDocument } from './utils';
import {
  TPIN, TaxTypeNumericalCode, Date, TaxAccountCode,
} from './constants';

export enum ReportCode {
  PENDING_LIABILITY = '10093',
  TAX_PAYER_LEDGER = '10085',
}

interface ReportData {
  /** String containing the actual HTML of the table. */
  rsltTableHtml: string;
  /** A string that just seems to contain "ZRA Confidential". */
  conf_str: string;
  /** Unknown value. Seems to be short for "Report export file count". E.g. "1" */
  rprtExprtFileCnt: string;
  /** The total number of pages in the report. E.g. "7" */
  noOfPages: string;
  /** E.g. "1000" */
  exportRowSize: string;
  /** The total number of records in the report. E.g. "129" */
  totalRowCnt: string;
  /** Unknown value. Seems to be short for "Receipt required". E.g. "Y" */
  recpReq: string;
}

/**
 * The response of the request to get a single report page is in a custom format. It contains the
 * HTML of the report as well as some meta data such as the total number of pages and records.
 * This converts the response to a JSON format that is actually usable.
 * @param response The page to parse.
 */
export function parseReportPage(response: string): ReportData {
  // Since there is often a new-line at the beginning of the response and whitespaces at the end,
  // make sure to trim the response first.
  const trimmedResponse = response.trim();
  // The response contains "rprt" keys and values. Each key is prefixed by a "<rprt-key-ends>" tag
  // while each value is prefixed by a "<rprt-value-ends>" tag
  const split = trimmedResponse.split('<rprt-value-ends>');
  const data: { [key: string]: string } = {};
  for (const item of split) {
    const [key, value] = item.split('<rprt-key-ends>');
    if (key) {
      data[key] = value;
    }
  }
  // FIXME: Handle expected keys being missing
  return data;
}

interface ReportPage<H extends string> {
  numPages: number;
  numRecords: number;
  parsedTable: ParsedReportTable<H>;
}

interface GetReportPageFnOptions<H extends string> {
  tpin: TPIN;
  /** The ID of the type of report to get. */
  reportCode: ReportCode;
  /** Parameters to pass to the HTTP request. */
  request: object;
  /** The columns in the report table. */
  reportHeaders: H[];
  /** The page of the report to get. */
  page: number;
}

/**
 * Gets a particular page of a report.
 */
async function getReportPage<H extends string>({
  reportCode,
  tpin,
  request,
  reportHeaders,
  page,
}: GetReportPageFnOptions<H>): Promise<ReportPage<H>> {
  const response = await makeRequest({
    url: 'https://www.zra.org.zm/frontController.do',
    method: 'post',
    data: {
      ...request,
      ...{
        actionCode: 'RPRTPAJAXSRCHDATASTRING',
        crntRprtLevel: '1',
        ajaxRequestType: 'goToPage',
        prm1_tpin: tpin,
        reportCode,
        prm1_reportCode: reportCode,
        reqPageNum: page,
        // TODO: Find out if a page number needs to be provided
        // prm1_rprtPageNum: '',
        prm1_paraDisStr: '',
      },
    },
  });
  // The response contains the number of pages and records in addition to the report's actual
  // report HTML string. We must parse the string to extract this information.
  const parsed = parseReportPage(response);
  // We then convert the HTML string to an actual HTML document
  const reportDocument = parseDocument(parsed.rsltTableHtml);
  // Finally, we extract the actual data in the report from the HTML document.
  const parsedTable = await parseReportTable({
    root: reportDocument,
    headers: reportHeaders,
  });
  // TODO: Decide which number of pages is more reliable. The one from the document or the one
  // first AJAX request.
  return {
    parsedTable,
    numPages: Number(parsed.noOfPages),
    numRecords: Number(parsed.totalRowCnt),
  };
}

interface GetPendingLiabilityPageFnOptions {
  tpin: TPIN;
  /**
   * ID of the tax account to get pending liability totals from. E.g. 119608 or 405534. If this is not
   * provided, all the accounts with the provided tax type will be retrieved instead.
   */
  accountCode?: TaxAccountCode;
  taxTypeId: TaxTypeNumericalCode;
  /** The page to get */
  page: number;
}

/**
 * Gets a single page of pending liabilities.
 */
export function getPendingLiabilityPage({
  tpin,
  accountCode = '',
  taxTypeId,
  page,
}: GetPendingLiabilityPageFnOptions) {
  return getReportPage({
    tpin,
    reportCode: ReportCode.PENDING_LIABILITY,
    page,
    request: {
      prm1_accountName: accountCode,
      prm1_TaxType: taxTypeId,
      prm1_ajaxComboTarget: 'accountName',
    },
    reportHeaders: [
      'srNo',
      'accountName',
      'periodFrom',
      'periodTo',
      'principal',
      'interest',
      'penalty',
      'total',
    ],
  });
}

interface GetTaxPayerLedgerPageFnOptions {
  tpin: TPIN;
  accountCode: TaxAccountCode;
  fromDate: Date;
  toDate: Date;
  /** The page to get. */
  page: number;
}

/**
 * Gets a single page from the tax payer ledger.
 */
export function getTaxPayerLedgerPage({
  tpin,
  accountCode,
  fromDate,
  toDate,
  page,
}: GetTaxPayerLedgerPageFnOptions) {
  return getReportPage({
    tpin,
    reportCode: ReportCode.TAX_PAYER_LEDGER,
    page,
    request: {
      prm1_Dtto: toDate,
      prm1_Dtfrom: fromDate,
      prm1_acntName: accountCode,
      prm1_ajaxComboTarget: '',
      // prm1_loc_code: '',
    },
    reportHeaders: [
      'srNo',
      'transactionDate',
      'fromDate',
      'toDate',
      'narration',
      'debit',
      'credit',
      'cumulativeBalance',
    ],
  });
}
