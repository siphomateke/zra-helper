import moment from 'moment';
import { getDocumentByAjax } from '../utils';
import { parseTableAdvanced, ParsedTableLinkCell } from '../content_scripts/helpers/zra';
import {
  taskFunction,
  downloadPages,
  downloadPage,
  GetDataFromPageFunctionReturn,
} from './utils';
import {
  startDownloadingReceipts,
  finishDownloadingReceipts,
  getFailedResponseItems,
  getReceiptData,
  getDataFromReceiptTab,
} from './receipts';
import {
  taxTypeNames,
  TaxTypeNumericalCode,
  taxTypes,
  DateString,
  ReferenceNumber,
  TaxTypeName,
  Client,
} from '../constants';
import {
  createClientAction,
  ClientActionRunner,
  getInput,
} from './base';
import { InvalidReceiptError } from '../errors';
import getDataFromReceipt, { PaymentReceiptData } from '../content_scripts/helpers/receipt_data';
import { TaskId } from '@/store/modules/tasks';
import { objKeysExact } from '@/utils';

interface PrnNo extends ParsedTableLinkCell {
  /** E.g. '118019903987' */
  innerText: string;
  /**
   * Contains information about the payment such as search code, reference number and payment type
   * in the following format:
   * `payementHistory('<search code>','<reference number>','<payment type>')`
   * E.g.
   * `payementHistory('123456789','123456789','ABC')`
   */
  onclick: string;
}

interface PaymentReceipt {
  /** Serial number */
  srNo: string;
  /** PRN number */
  prnNo: PrnNo;
  /** Amount in Kwacha */
  amount: string;
  /** E.g. 'Payment received' */
  status: string;
  prnDate: DateString;
  paymentDate: DateString;
  /** Payment type. E.g. 'Electronic' */
  type: string;
}

interface GetPaymentReceiptsOptions {
  fromDate: DateString;
  toDate: DateString;
  receiptNumber?: string;
  referenceNumber?: ReferenceNumber;
}

/**
 * Gets payment receipts from a single page.
 */
async function getPaymentReceipts(
  page: number,
  {
    fromDate, toDate, referenceNumber = '', receiptNumber = '',
  }: GetPaymentReceiptsOptions,
): Promise<GetDataFromPageFunctionReturn<PaymentReceipt[]>> {
  const doc = await getDocumentByAjax({
    url: 'https://www.zra.org.zm/ePaymentController.htm?actionCode=SearchPmtDetails',
    method: 'post',
    data: {
      currentPage: page,
      periodFrom: fromDate,
      periodTo: toDate,
      ackNo: referenceNumber,
      prnNo: receiptNumber,
    },
  });
  const table = await parseTableAdvanced({
    root: doc,
    headers: ['srNo', 'prnNo', 'amount', 'status', 'prnDate', 'paymentDate', 'type'],
    tableInfoSelector: '#contentDiv>table>tbody>tr>td',
    recordSelector: '#contentDiv>table:nth-child(2)>tbody>tr',
    noRecordsString: 'No Records Found',
    parseLinks: true,
  });
  let { records } = table;
  if (records.length > 0) {
    // Remove header row
    records.shift();
  }
  // Since `parseLinks` is true when parsing the table, if any of the cells contain links, they
  // will be parsed. To make sure no fields that currently aren't links aren't parsed as links in
  // the future, make sure to convert each cell to the correct type.
  // TODO: Consider moving this logic into `parseTableAdvanced`.
  let convertedRecords: PaymentReceipt[] = records.map((record) => {
    const convertedRecord: PaymentReceipt = {} as PaymentReceipt;
    for (const key of objKeysExact(record)) {
      const value = record[key];
      if (key !== 'prnNo') {
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
    convertedRecords = convertedRecords.filter(record => record.status.toLowerCase() !== 'prn generated');
  }
  return {
    numPages: table.numPages,
    value: convertedRecords,
  };
}

interface Payment {
  taxType: TaxTypeName;
  periodFrom: string;
  periodTo: string;
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
  const uniquePayments = [];
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
    const taxTypeId = taxTypeNames[payment.taxType.toLowerCase()];
    const periodFrom = moment(payment.periodFrom, 'DD/MM/YYYY');
    const periodTo = moment(payment.periodTo, 'DD/MM/YYYY');
    let filename = `receipt-${client.username}-${taxTypes[taxTypeId]}`;
    if (taxTypeId === TaxTypeNumericalCode.ITX) {
      const chargeYear = periodTo.format('YYYY');
      filename += `-${chargeYear}`;

      const periodFromMonth = periodFrom.format('MM');
      const periodToMonth = periodTo.format('MM');
      // Don't add quarter if the period is a whole year
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

function downloadPaymentReceipt({
  client,
  receipt,
  parentTaskId,
}: {
  client: Client;
  receipt: PaymentReceipt;
  parentTaskId: TaskId;
}) {
  const [searchCode, refNo, pmtRegType] = receipt.prnNo.onclick
    .replace(/'/g, '')
    .match(/\((.+)\)/)[1]
    .split(',');

  return downloadPage({
    async filename(dataSource) {
      let receiptData: PaymentReceiptData;
      if (dataSource instanceof HTMLDocument) {
        receiptData = await getDataFromReceipt(dataSource, 'payment');
      } else {
        receiptData = await getDataFromReceiptTab(dataSource, 'payment');
      }
      if (!receiptData.referenceNumber) {
        throw new InvalidReceiptError('Invalid receipt; missing reference number.');
      }
      return getPaymentReceiptFilenames(client, receiptData);
    },
    taskTitle: `Download receipt ${refNo}`,
    parentTaskId,
    createTabPostOptions: {
      url: 'https://www.zra.org.zm/ePaymentController.htm',
      data: {
        actionCode: 'generateView',
        searchcode: searchCode,
        referencecode: refNo,
        pmtRegType,
        printReceipt: 'N',
      },
    },
  });
}

export namespace GetPaymentReceiptsAction {
  export interface Input {
    fromDate?: DateString;
    toDate?: DateString;
    receipts?: PaymentReceipt[];
    receiptDataPages?: number[];
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
  GetPaymentReceiptsAction.Input
  > {
  constructor() {
    super(GetPaymentReceiptsClientAction);
  }

  async runInternal() {
    const { task: actionTask, client, input } = this.storeProxy;
    actionTask.unknownMaxProgress = false;
    actionTask.progressMax = 2;

    const failed: { receipts: PaymentReceipt[]; receiptDataPages: number[] } = {
      receipts: [],
      receiptDataPages: [],
    };

    await taskFunction({
      task: actionTask,
      setStateBasedOnChildren: true,
      func: async () => {
        // If specific receipts have been requested to be downloaded, use those.
        const { value: receipts } = getInput(input, 'receipts', { defaultValue: [] });

        // If getting certain receipt data pages failed last time, only get those pages.
        const { value: pages } = getInput(input, 'receiptDataPages', { defaultValue: [] });

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
          failed.receiptDataPages = failedPages;
        }

        // TODO: Indicate why receipts weren't downloaded
        if (receipts.length > 0) {
          actionTask.status = `Downloading ${receipts.length} payment receipt(s)`;
          await startDownloadingReceipts();
          const downloadResponses = await downloadPages({
            taskTitle: `Download ${receipts.length} payment receipt(s)`,
            parentTaskId: actionTask.id,
            list: receipts,
            downloadPageFn(receipt, parentTaskId) {
              return downloadPaymentReceipt({ receipt, parentTaskId, client });
            },
          });
          await finishDownloadingReceipts();
          failed.receipts = getFailedResponseItems(downloadResponses);
        }
      },
    });

    if (failed.receipts.length > 0 || failed.receiptDataPages.length > 0) {
      this.setRetryReason('Some receipts failed to download.');
      if (failed.receipts.length > 0) {
        this.storeProxy.retryInput.receipts = failed.receipts;
      }
      if (failed.receiptDataPages.length > 0) {
        this.storeProxy.retryInput.receiptDataPages = failed.receiptDataPages;
      }
    }
  }
};

export default GetPaymentReceiptsClientAction;
