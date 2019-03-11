import { taxTypeNamesInverted } from './constants';
import { parseReportTable } from './content_scripts/helpers/zra';
import { makeRequest, parseDocument } from './utils';

const reportCodes = {
  PENDING_LIABILITY: '10093',
  TAX_PAYER_LEDGER: '10085',
};

/**
 * Converts an account name into a format that report requests accept. At the moment, the
 * conversion just converts the account name to uppercase.
 * @param {string} accountName
 * @returns {string}
 */
function convertAccountNameForHeaderString(accountName) {
  return accountName.toUpperCase();
}

/**
 * Converts JSON to a special string where each keys and values are separated by colons (:) and
 * key value pairs are separated by tildes (\~). For example,`key1:value1~key2:value2~`.
 *
 * This format is used by report AJAX requests.
 * @param {Object} data
 * @returns {string}
 */
function buildHeaderString(data) {
  let string = '';
  for (const key of Object.keys(data)) {
    const value = data[key];
    string += `${key}:${value}~`;
  }
  return string.replace(' ', '+');
}

/**
 *
 * @param {Object} options
 * @param {string} options.accountName
 * @param {string} options.fromDate
 * @param {string} options.toDate
 * @returns {string}
 */
function generateTaxPayerLedgerHeaderString({ accountName, fromDate, toDate }) {
  return buildHeaderString({
    'Account Name': convertAccountNameForHeaderString(accountName),
    'Date From': fromDate,
    'Date To': toDate,
  });
}

/**
 *
 * @param {Object} options
 * @param {string} options.accountName
 * @param {string} options.tpin Same as client's username.
 * @param {import('./constants').TaxTypeNumericalCode} options.taxTypeId
 * @returns {string}
 */
function generatePendingLiabilityHeaderString({ accountName, tpin, taxTypeId }) {
  return buildHeaderString({
    'Account Name': convertAccountNameForHeaderString(accountName),
    TPIN: tpin,
    // TODO: Check if the tax type name needs to be specially capitalized
    'Tax Type': taxTypeNamesInverted[taxTypeId],
  });
}

/**
 * @typedef {Object} ReportData
 * @property {string} rsltTableHtml String containing the actual HTML of the table.
 * @property {string} conf_str A string that just seems to contain "ZRA Confidential".
 * @property {string} rprtExprtFileCnt
 * Unknown value. Seems to be short for "Report export file count". E.g. "1"
 * @property {string} noOfPages The total number of pages in the report. E.g. "7"
 * @property {string} exportRowSize E.g. "1000"
 * @property {string} totalRowCnt The total number of records in the report. E.g. "129"
 * @property {string} recpReq Unknown value. Seems to be short for "Receipt required". E.g. "Y"
 */

/**
 * The response of the request to get a single report page is in a custom format. It contains the
 * HTML of the report as well as some meta data such as the total number of pages and records.
 * This converts the response to a JSON format that is actually usable.
 * @param {string} response The page to parse.
 * @returns {ReportData}
 */
export function parseReportPage(response) {
  // Since there is often a new-line at the beginning of the response and whitespaces at the end,
  // make sure to trim the response first.
  const trimmedResponse = response.trim();
  // The response contains "rprt" keys and values. Each key is prefixed by a "<rprt-key-ends>" tag
  // while each value is prefixed by a "<rprt-value-ends>" tag
  const split = trimmedResponse.split('<rprt-value-ends>');
  const data = {};
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
 * @typedef {Object} ReportPage
 * @property {number} numPages
 * @property {number} numRecords
 * @property {import('@/backend/content_scripts/helpers/zra').ParsedReportTable} parsedTable
 */

/**
 * Gets a particular page of a report.
 * @param {Object} options
 * @param {string} options.tpin Same as client's username.
 * @param {string} options.reportCode The ID of the type of report to get.
 * @param {Object} options.request Parameters to pass to the HTTP request.
 * @param {string[]} options.reportHeaders The columns in the report table.
 * @param {number} options.page The page of the report to get.
 * @returns {Promise.<ReportPage>}
 */
async function getReportPage({
  reportCode,
  tpin,
  request,
  reportHeaders,
  page,
}) {
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

/**
 * Gets a single page of pending liabilities.
 * @param {Object} options
 * @param {string} options.tpin Same as client's username.
 * @param {string} options.accountCode E.g. 119608 or 405534
 * @param {string} options.accountName E.g. john smith-income tax
 * @param {import('./constants').TaxTypeNumericalCode} options.taxTypeId
 * @param {number} options.page The page to get.
 * @returns {Promise.<ReportPage>}
 */
export function getPendingLiabilityPage({
  tpin,
  accountCode,
  accountName,
  taxTypeId,
  page,
}) {
  return getReportPage({
    tpin,
    reportCode: reportCodes.PENDING_LIABILITY,
    page,
    request: {
      prm1_accountName: accountCode,
      prm1_TaxType: taxTypeId,
      prm1_ajaxComboTarget: 'accountName',
      prm1_paraDisStr: generatePendingLiabilityHeaderString({ accountName, tpin, taxTypeId }),
    },
    // FIXME: This is a duplicate of get_totals
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

/**
 * Gets a single page from the tax payer ledger.
 * @param {Object} options
 * @param {string} options.tpin Same as client's username.
 * @param {string} options.accountCode E.g. 119608 or 405534
 * @param {string} options.accountName E.g. john smith-income tax
 * @param {string} options.fromDate Format must be DD/MM/YYYY
 * @param {string} options.toDate Format must be DD/MM/YYYY
 * @param {number} options.page The page to get.
 * @returns {Promise.<ReportPage>}
 */
export function getTaxPayerLedgerPage({
  tpin,
  accountCode,
  accountName,
  fromDate,
  toDate,
  page,
}) {
  return getReportPage({
    tpin,
    reportCode: reportCodes.TAX_PAYER_LEDGER,
    page,
    request: {
      prm1_Dtto: toDate,
      prm1_Dtfrom: fromDate,
      prm1_acntName: accountCode,
      prm1_ajaxComboTarget: '',
      // prm1_loc_code: '',
      prm1_paraDisStr: generateTaxPayerLedgerHeaderString({ accountName, fromDate, toDate }),
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
