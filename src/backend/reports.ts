import { parseReportTable, ParsedReportTable } from './content_scripts/helpers/zra';
import { makeRequest, parseDocument } from './utils';
import {
  TPIN,
  TaxTypeNumericalCode,
  DateString,
  TaxAccountCode,
  ZraDomain,
  taxTypeHumanNames,
  TaxAccountName,
} from './constants';
import { getElementFromDocument } from './content_scripts/helpers/elements';

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

/**
 * Generates a string representing report header parameters from an object. Report header
 * parameters are the headers shown above report tables such as tax payer ledger and pending
 * liability reports.
 *
 * The header parameters are key value pairs with keys and values separated by ':' and pairs
 * separated by '~'.
 *
 * @example
 * generateReportHeaderParamStrFromObj({
 *   TPIN: '1000000000',
 *   'Tax Type': 'Income Tax',
 * });
 * // => 'TPIN:1000000000~Tax+Type:Income+Tax~'
 */
function generateReportHeaderParamStrFromObj(obj: { [key: string]: string }): string {
  let str = '';
  for (const key of Object.keys(obj)) {
    str += `${key}:${obj[key]}~`;
  }
  // Note: The ZRA website seems to replace spaces with pluses(+). We aren't currently doing that
  // because when tested, the pluses incorrectly showed up in the generated report.
  return str;
}

interface ReportPage<H extends string> {
  numPages: number;
  numRecords: number;
  parsedTable: ParsedReportTable<H>;
  /** The internal HTML table element from the report. */
  reportDocument: HTMLDocument;
}

interface BaseGetReportPageFnOptions {
  /** Same as client's username. */
  tpin: TPIN;
  /** The ID of the type of report to get. */
  reportCode: ReportCode;
  /** Parameters to pass to the HTTP request. */
  request: object;
}

interface GetReportPageFnOptions<H extends string> extends BaseGetReportPageFnOptions {
  /** The columns in the report table. */
  reportHeaders: H[];
  /** The page of the report to get. */
  page: number;
}

/**
 * Root URL of ZRA report pages.
 *
 * This variable is pretty much only here so it can be used as the root URL of page resources when
 * downloading report pages.
 */
export const ZraReportPageUrl = `${ZraDomain}/frontController.do`;

/**
 * Gets the full first page of a report, not just the table.
 */
async function getFirstReportPage({
  request,
  reportCode,
  tpin,
}: BaseGetReportPageFnOptions): Promise<HTMLDocument> {
  const response = await makeRequest<string>({
    url: ZraReportPageUrl,
    method: 'post',
    data: {
      ...request,
      ...{
        actionCode: 'REPORTSEARCHRESULTSNEW',
        FromParaPage: 'TRUE',
        prm_tpin: tpin,
        prm0_actionCode: 'RPRTPARAMETERPAGE',
        prm0_reportCode: reportCode,
        reportCode,
        tpin,
      },
    },
  });
  return parseDocument(response);
}

/**
 * Inserts a report page table into the full first page of a report.
 * @param fullReportPage The full first page of the report.
 * @param reportPageTable A report page table retrieved using `getReportPage`.
 * @returns A modified version of the full report page with the passed report page table inserted
 * into it.
 */
export function changeTableOfFullReportPage(
  fullReportPage: HTMLDocument,
  reportPageTable: HTMLDocument,
): HTMLDocument {
  const fullReportPageCopy = <HTMLDocument>fullReportPage.cloneNode(true);
  const table = getElementFromDocument(fullReportPageCopy, '#rsltTableHtml', 'report inner table');
  if (reportPageTable.body.firstElementChild === null) {
    throw new Error('Report page has no root body element');
  }
  table.innerHTML = reportPageTable.body.firstElementChild.innerHTML;
  return fullReportPageCopy;
}

/**
 * Gets a particular page of a report.
 *
 * Note: this only gets the inner table of the report where the actual data lives.
 */
async function getReportPage<H extends string>({
  reportCode,
  tpin,
  request,
  reportHeaders,
  page,
}: GetReportPageFnOptions<H>): Promise<ReportPage<H>> {
  const response = await makeRequest<string>({
    url: `${ZraDomain}/frontController.do`,
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
    reportDocument,
  };
}

interface GeneratePendingLiabilityReportHeaderParamStrFnOptions {
  tpin: TPIN;
  taxTypeId: TaxTypeNumericalCode;
  /** Lowercase account name */
  accountName: TaxAccountName;
}

/**
 * Generates a pending liability report header parameters string.
 */
function generatePendingLiabilityReportHeaderParamStr({
  tpin, taxTypeId, accountName,
}: GeneratePendingLiabilityReportHeaderParamStrFnOptions) {
  return generateReportHeaderParamStrFromObj({
    TPIN: tpin,
    'Tax Type': taxTypeHumanNames[taxTypeId],
    'Account Name': accountName.toUpperCase(),
  });
}

interface BaseGetPendingLiabilityPageFnOptions {
  /** Same as client's username. */
  tpin: TPIN;
  /**
   * ID of the tax account to get pending liability totals from. E.g. 119608 or 405534. If this is
   * not provided, all the accounts with the provided tax type will be retrieved instead.
   */
  taxTypeId: TaxTypeNumericalCode;
}

interface GetFirstPendingLiabilityPageFnOptions extends BaseGetPendingLiabilityPageFnOptions {
  accountName: TaxAccountName;
}

interface GetPendingLiabilityPageFnOptions extends BaseGetPendingLiabilityPageFnOptions {
  accountCode?: TaxAccountCode;
  /** The page to get */
  page: number;
}

/**
 * Gets the full first pending liability page.
 */
export function getFirstPendingLiabilityPage({
  tpin,
  taxTypeId,
  accountName,
}: GetFirstPendingLiabilityPageFnOptions) {
  return getFirstReportPage({
    tpin,
    reportCode: ReportCode.PENDING_LIABILITY,
    request: {
      prm0_tpin: tpin,
      prm_TaxType: taxTypeId,
      hParaShowString: generatePendingLiabilityReportHeaderParamStr({
        tpin, taxTypeId, accountName,
      }),
      prm_ajaxComboTarget: 'accountName',
    },
  });
}

/**
 * Gets a single page of pending liabilities.
 *
 * Note: this only gets the inner table of the report where the actual data lives.
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

interface GenerateTaxPayerLedgerReportHeaderParamStrFnOptions {
  accountName: TaxAccountName;
  fromDate: DateString;
  toDate: DateString;
}

/**
 * Generates a tax payer ledger report header parameters string.
 */
function generateTaxPayerLedgerReportHeaderParamStr({
  accountName, fromDate, toDate,
}: GenerateTaxPayerLedgerReportHeaderParamStrFnOptions) {
  return generateReportHeaderParamStrFromObj({
    'Account Name': accountName.toUpperCase(),
    'Date From': fromDate,
    'Date To': toDate,
  });
}

interface BaseGetTaxPayerLedgerPageFnOptions {
  /** Same as client's username. */
  tpin: TPIN;
  /** E.g. 119608 or 405534 */
  accountCode: TaxAccountCode;
  /** Format must be DD/MM/YYYY */
  fromDate: DateString;
  /** Format must be DD/MM/YYYY */
  toDate: DateString;
}

interface GetFirstTaxPayerLedgerPageFnOptions extends BaseGetTaxPayerLedgerPageFnOptions {
  accountName: TaxAccountName;
}

interface GetTaxPayerLedgerPageFnOptions extends BaseGetTaxPayerLedgerPageFnOptions {
  /** The page to get. */
  page: number;
}

/**
 * @typedef {Object} TaxPayerLedgerRecord
 * @property {string} srNo
 * @property {string} transactionDate
 * @property {string} fromDate
 * @property {string} toDate
 * @property {string} narration
 * @property {string} debit
 * @property {string} credit
 * @property {string} cumulativeBalance
 */

export const ledgerColumns = [
  'srNo',
  'transactionDate',
  'fromDate',
  'toDate',
  'narration',
  'debit',
  'credit',
  'cumulativeBalance',
];

export const ledgerTableColumns = [
  { field: 'srNo', label: 'Serial No.' },
  { field: 'transactionDate', label: 'Transaction date' },
  { field: 'fromDate', label: 'From date' },
  { field: 'toDate', label: 'To date' },
  { field: 'narration', label: 'Narration' },
  { field: 'debit', label: 'Debit' },
  { field: 'credit', label: 'Credit' },
];

/**
 * Gets the full first tax payer ledger page.
 */
export function getFirstTaxPayerLedgerPage({
  tpin,
  accountCode,
  accountName,
  fromDate,
  toDate,
}: GetFirstTaxPayerLedgerPageFnOptions) {
  return getFirstReportPage({
    tpin,
    reportCode: ReportCode.TAX_PAYER_LEDGER,
    request: {
      prm_Dtto: toDate,
      prm_Dtfrom: fromDate,
      prm_acntName: accountCode,
      prm_ajaxComboTarget: '',
      hParaShowString: generateTaxPayerLedgerReportHeaderParamStr({
        accountName,
        fromDate,
        toDate,
      }),
    },
  });
}

/**
 * Gets a single page from the tax payer ledger.
 *
 * Note: this only gets the inner table of the report where the actual data lives.
 */
export function getTaxPayerLedgerPage({
  tpin,
  accountCode,
  fromDate,
  toDate,
  page,
}: GetTaxPayerLedgerPageFnOptions): Promise<ReportPage<TaxPayerLedgerRecord>> {
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
    reportHeaders: ledgerColumns,
  });
}
