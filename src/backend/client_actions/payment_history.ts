import moment from 'moment';
import { getDocumentByAjax, makeRequest } from '../utils';
import { ParsedTableLinkCell, parseTable } from '../content_scripts/helpers/zra';
import {
  taskFunction,
  downloadPages,
  downloadPage,
  GetDataFromPageFunctionReturn,
  startDownloadingPages,
  finishDownloadingPages,
} from './utils';
import {
  getFailedResponseItems,
  getReceiptData,
} from './receipts';
import {
  taxTypeNamesMap,
  TaxTypeNumericalCode,
  taxTypes,
  DateString,
  TaxTypeName,
  Client,
  ZraDomain,
} from '../constants';
import {
  createClientAction,
  ClientActionRunner,
  getInput,
  BasicRunnerOutput,
  BasicRunnerConfig,
} from './base';
import { TaskId } from '@/store/modules/tasks';
import { objKeysExact } from '@/utils';
import createTask from '@/transitional/tasks';
import store from '@/store';
import { getElementFromDocument } from '../content_scripts/helpers/elements';

interface ViewDetailsColumn extends ParsedTableLinkCell {
  /** E.g. '"Details"' */
  innerText: string;
  /**
   * Contains the payment ID in the following format:
   * `viewPaymentDetails('123456')`
   */
  onclick: string;
}

interface PrintReceiptColumn extends ParsedTableLinkCell {
  /** E.g. 'Print Receipt' */
  innerText: string;
  /**
   * Contains the payment ID in the following format:
   * `printReceipt('194902')`
   */
  onclick: string;
}

type PaymentId = string;

interface PaymentReceipt {
  /** Serial number */
  srNo: string;
  /** PRN number */
  prnNo: string;
  /** Amount in Kwacha */
  amount: string;
  /** E.g. 'Payment received' */
  status: string;
  /** E.g. '21 May, 2020' */
  generatedDate: string;
  viewDetails: ViewDetailsColumn;
  printReceipt: PrintReceiptColumn;
}

interface GetPaymentReceiptsOptions {
  fromDate: DateString;
  toDate: DateString;
}

/**
 * Gets payment receipts from a single page.
 */
async function getPaymentReceipts(
  // This page argument is kept in case ZRA v2 paginates payment history again
  page: number,
  { fromDate, toDate }: GetPaymentReceiptsOptions,
): Promise<GetDataFromPageFunctionReturn<PaymentReceipt[]>> {
  // TODO: Try passing period start date and to date
  const doc = await getDocumentByAjax({ url: `${ZraDomain}/paymentHistory/history` });
  const records = await parseTable({
    root: getElementFromDocument(doc, '#paymentHistory', 'payment history table'),
    headers: [
      'srNo',
      'generatedDate',
      'prnNo',
      'amount',
      'status',
      'viewDetails',
      'printReceipt',
    ],
    recordSelector: 'tbody>tr',
    parseLinks: true,
  });
  // Since `parseLinks` is true when parsing the table, if any of the cells contain links, they
  // will be parsed. To make sure no fields that currently aren't links aren't parsed as links in
  // the future, make sure to convert each cell to the correct type.
  // TODO: Consider moving this logic into `parseTableAdvanced`.
  let convertedRecords: PaymentReceipt[] = records.map((record) => {
    const convertedRecord: PaymentReceipt = {} as PaymentReceipt;
    for (const key of objKeysExact(record)) {
      const value = record[key];
      if (!(key === 'viewDetails' || key === 'printReceipt')) {
        if (typeof value === 'string') {
          convertedRecord[key] = value;
        } else {
          convertedRecord[key] = value.innerText;
        }
      } else {
        convertedRecord[key] = <ParsedTableLinkCell>value;
      }
    }
    return convertedRecord;
  });
  if (convertedRecords.length > 0) {
    // Ignore all the payment registrations
    convertedRecords = convertedRecords.filter(record => record.status.toLowerCase() !== 'generated');
    // FIXME: Filter by fromDate and toDate
  }
  return {
    numPages: 1,
    value: convertedRecords,
  };
}

interface Payment {
  taxType: TaxTypeName;
  periodFrom: string;
  periodTo: string;
}

interface PaymentReceiptPayment {
  taxType: string;
  liabilityType: string;
  periodFrom: DateString;
  periodTo: DateString;
  amount: number;
}

interface PaymentReceiptData {
  prn: string;
  payments: PaymentReceiptPayment[];
}

/**
 * Checks if two payments are different.
 */
function paymentsDifferent(payment1: Payment, payment2: Payment): boolean {
  const mustBeEqual: Array<keyof Payment> = ['taxType', 'periodFrom', 'periodTo'];
  let anyDifferent = false;
  for (const prop of mustBeEqual) {
    if (payment1[prop] !== payment2[prop]) {
      anyDifferent = true;
      break;
    }
  }
  return anyDifferent;
}

/**
 * Gets the quarter number from a period.
 * @param from The month the period started. E.g. '01'
 * @param to The month the period ended.E.g. '03'
 */
function getQuarterFromPeriod(from: string, to: string): number | null {
  const quarterMap = [['01', '03'], ['04', '06'], ['07', '09'], ['10', '12']];
  let quarter = null;
  for (let i = 0; i < quarterMap.length; i++) {
    if (from === quarterMap[i][0] && to === quarterMap[i][1]) {
      quarter = i + 1;
      break;
    }
  }
  return quarter;
}

function getPaymentReceiptFilenames(client: Client, receiptData: PaymentReceiptData): string[] {
  const uniquePayments: PaymentReceiptPayment[] = [];
  for (const payment of receiptData.payments) {
    let unique = true;
    for (const paymentCompare of uniquePayments) {
      if (!paymentsDifferent(payment, paymentCompare)) {
        unique = false;
        break;
      }
    }
    if (unique) {
      uniquePayments.push(payment);
    }
  }

  return uniquePayments.map((payment) => {
    const taxTypeId = taxTypeNamesMap[payment.taxType.toLowerCase()];
    const periodFrom = moment(payment.periodFrom, 'DD/MM/YYYY');
    const periodTo = moment(payment.periodTo, 'DD/MM/YYYY');
    let filename = `receipt-${client.username}-${taxTypes[taxTypeId]}`;
    if (taxTypeId === TaxTypeNumericalCode.ITX) {
      const chargeYear = periodTo.format('YYYY');
      filename += `-${chargeYear}`;

      const periodFromMonth = periodFrom.format('MM');
      const periodToMonth = periodTo.format('MM');
      // Don't add quarter if the period is a whole year
      // Note: we could also check `payment.liabilityType` as it contains 'annual' if annual but
      // checking the actual period difference is probably more reliable.
      // TODO: Confirm the periods are indeed reliable.
      if (Number(periodToMonth) - Number(periodFromMonth) < 11) {
        const chargeQuater = getQuarterFromPeriod(periodFromMonth, periodToMonth);
        if (chargeQuater !== null) {
          filename += `-${chargeQuater}`;
        }
      }
    } else {
      filename += `-${periodTo.format('YYYY')}-${periodTo.format('MM')}`;
    }
    filename += `-${receiptData.prn}`;
    return filename;
  });
}

interface PaymentDetailsJson {
  AMOUNT: number;
  /** @example '-' */
  LIABILITY_REFERENCE_NUMBER: string;
  /** @example INCOME TAX PROVISIONAL */
  LIABILITY_TYPE_ID: string;
  /** @example 'January 01, 2020' */
  TAX_PERIOD_END_DATE: string;
  /** @example 'January 01, 2020' */
  TAX_PERIOD_START_DATE: string;
  /** @example 'Income Tax' */
  TAX_TYPE: '';
}

async function getPaymentDetails(paymentId: PaymentId): Promise<PaymentReceiptPayment[]> {
  const paymentDetailsJson = await makeRequest<PaymentDetailsJson[]>({
    url: `${ZraDomain}/paymentHistory/history/${paymentId}/paymentDetail`,
  });
  return paymentDetailsJson.map(p => ({
    taxType: p.TAX_TYPE,
    liabilityType: p.LIABILITY_TYPE_ID,
    periodFrom: moment(p.TAX_PERIOD_START_DATE, 'MMMM MM, YYYY').format('DD/MM/YYYY'),
    periodTo: moment(p.TAX_PERIOD_END_DATE, 'MMMM MM, YYYY').format('DD/MM/YYYY'),
    amount: p.AMOUNT,
  }));
}

async function downloadPaymentReceipt({
  client,
  receipt,
  parentTaskId,
}: {
  client: Client;
  receipt: PaymentReceipt;
  parentTaskId: TaskId;
}) {
  const paymentId: PaymentId = receipt.viewDetails.onclick.match(/\('(.+)'\)/)[1];
  const payments = await getPaymentDetails(paymentId);
  const filenames = getPaymentReceiptFilenames(client, { prn: receipt.prnNo, payments });
  return downloadPage({
    filename: filenames,
    taskTitle: `Download receipt ${paymentId}`,
    parentTaskId,
    downloadUrl: `${ZraDomain}/paymentHistory/history/${paymentId}/receipt?exportToPDF=true`,
  });
}

export namespace GetPaymentReceiptsAction {
  export interface Input {
    fromDate?: DateString;
    toDate?: DateString;
    receipts?: PaymentReceipt[];
    receiptDataPages?: number[];
  }

  export interface Failures {
    receipts: PaymentReceipt[];
    receiptDataPages: number[];
  }
}

const GetPaymentReceiptsClientAction = createClientAction<GetPaymentReceiptsAction.Input>({
  id: 'getPaymentReceipts',
  name: 'Get payment receipts',
  defaultInput: () => ({
    fromDate: '01/10/2013',
    toDate: moment().format('DD/MM/YYYY'),
  }),
  inputValidation: {
    fromDate: 'required|date_format:dd/MM/yyyy|before:toDate,true',
    toDate: 'required|date_format:dd/MM/yyyy|after:fromDate,true',
  },
});


GetPaymentReceiptsClientAction.Runner = class extends ClientActionRunner<
  GetPaymentReceiptsAction.Input,
  BasicRunnerOutput,
  BasicRunnerConfig,
  GetPaymentReceiptsAction.Failures
  > {
  failures: GetPaymentReceiptsAction.Failures = {
    receipts: [],
    receiptDataPages: [],
  };

  constructor() {
    super(GetPaymentReceiptsClientAction);
  }

  getInitialFailuresObj() {
    return {
      receipts: [],
      receiptDataPages: [],
    };
  }

  async runInternal() {
    const { task: actionTask, client, input } = this.storeProxy;
    actionTask.unknownMaxProgress = false;
    actionTask.progressMax = 2;

    await taskFunction({
      task: actionTask,
      setStateBasedOnChildren: true,
      func: async () => {
        // If specific receipts have been requested to be downloaded, use those.
        const { value: receipts } = getInput<Exclude<GetPaymentReceiptsAction.Input['receipts'], undefined>>(input, 'receipts', { defaultValue: [] });

        // If getting certain receipt data pages failed last time, only get those pages.
        const { value: pages } = getInput<Exclude<GetPaymentReceiptsAction.Input['receiptDataPages'], undefined>>(input, 'receiptDataPages', { defaultValue: [] });

        if (pages.length > 0 || receipts.length === 0) {
          actionTask.status = 'Getting payment receipt numbers';
          const { data, failedPages } = await getReceiptData({
            taskTitle: 'Get payment receipt numbers',
            getPageTaskTitle: page => `Get payment receipt numbers from page ${page}`,
            getDataFunction: page => getPaymentReceipts(page, {
              fromDate: input.fromDate,
              toDate: input.toDate,
            }),
            parentTaskId: actionTask.id,
            pages,
          });
          receipts.push(...data);
          this.failures.receiptDataPages = failedPages;
        }

        // TODO: Indicate why receipts weren't downloaded
        if (receipts.length > 0) {
          actionTask.status = `Downloading ${receipts.length} payment receipt(s)`;
          await startDownloadingPages();
          const downloadResponses = await downloadPages({
            task: await createTask(store, {
              title: `Download ${receipts.length} payment receipt(s)`,
              parent: actionTask.id,
            }),
            list: receipts,
            func(receipt, parentTaskId) {
              return downloadPaymentReceipt({ receipt, parentTaskId, client });
            },
          });
          await finishDownloadingPages();
          this.failures.receipts = getFailedResponseItems(downloadResponses);
        }
      },
    });
  }

  checkIfAnythingFailed() {
    return this.failures.receipts.length > 0 || this.failures.receiptDataPages.length > 0;
  }

  getRetryReasons() {
    const reasons = super.getRetryReasons();
    reasons.push('Some receipts failed to download.');
    return reasons;
  }

  getRetryInput() {
    const retryInput: GetPaymentReceiptsAction.Input = {};
    if (this.failures.receipts.length > 0) {
      retryInput.receipts = this.failures.receipts;
    }
    if (this.failures.receiptDataPages.length > 0) {
      retryInput.receiptDataPages = this.failures.receiptDataPages;
    }
    return retryInput;
  }
};

export default GetPaymentReceiptsClientAction;
