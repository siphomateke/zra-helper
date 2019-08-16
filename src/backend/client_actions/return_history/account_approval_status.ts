import { get } from 'dot-prop';
import { createClientAction, getInput } from '../base';
import {
  GetReturnHistoryClientActionOptions,
  ReturnHistoryReturnDependentRunner,
  TaxReturn,
  ReturnHistoryClientAction,
  ReturnDependentFnOptions,
} from './base';
import {
  TaxTypeNumericalCode,
  taxTypes,
  financialAccountStatusTypesMap,
  financialAccountStatusDescriptionsMap,
  financialAccountStatusTypeNames,
  ExportFormatCode,
  FinancialAccountStatus,
  FinancialAccountStatusType,
  TaxTypeIdMap,
} from '@/backend/constants';
import { getClientIdentifier, parallelTaskMap, taskFunction } from '../utils';
import { unparseCsv, objectToCsvTable, writeJson } from '@/backend/file_utils';
import { getDocumentByAjax } from '@/backend/utils';
import { generateAckReceiptRequest } from './ack_receipt';
import getDataFromReceipt, { AcknowledgementReceiptData } from '@/backend/content_scripts/helpers/receipt_data';
import createTask from '@/transitional/tasks';
import store from '@/store';

function getFinancialAccountStatusType(
  status: FinancialAccountStatus,
): FinancialAccountStatusType | null {
  for (const type of Object.keys(financialAccountStatusTypesMap)) {
    if (financialAccountStatusTypesMap[type].includes(status)) {
      return <FinancialAccountStatusType>type;
    }
  }
  return null;
}

/** Tax return with extra information such as financial account status code. */
interface TaxReturnExtended extends TaxReturn {
  /** Financial account status code */
  status: FinancialAccountStatus;
  statusType: FinancialAccountStatusType;
  statusDescription: string;
  /** Provisional or annual */
  provisional?: boolean;
}

export namespace AccountApprovalStatusClientAction {
  export interface Input extends ReturnHistoryClientAction.Input {
    taxTypeIds: TaxTypeNumericalCode[];
    getAckReceipts: boolean;
  }
  export type Output = TaxTypeIdMap<TaxReturnExtended[]>;
}

const CheckAccountApprovalStatusClientAction = createClientAction<
  AccountApprovalStatusClientAction.Input,
  AccountApprovalStatusClientAction.Output
>({
  ...GetReturnHistoryClientActionOptions,
  id: 'checkAccountApprovalStatus',
  name: 'Check account approval status',
  defaultInput: () => ({
    ...GetReturnHistoryClientActionOptions.defaultInput(),
    taxTypeIds: [TaxTypeNumericalCode.ITX],
    getAckReceipts: false,
  }),
  hasOutput: true,
  defaultOutputFormat: ExportFormatCode.CSV,
  outputFormats: [ExportFormatCode.CSV, ExportFormatCode.JSON],
  outputFormatter({
    clients,
    outputs: clientOutputs,
    format,
    anonymizeClients,
  }) {
    // TODO: Only include provisional column if `getAckReceipts` is true
    if (format === ExportFormatCode.CSV) {
      const csvOutput = {};
      for (const client of clients) {
        if (client.id in clientOutputs) {
          const { value } = clientOutputs[client.id];
          if (value) {
            const clientIdentifier = getClientIdentifier(client, anonymizeClients);
            const clientOutput = {};
            for (const taxTypeId of Object.keys(value)) {
              const taxReturns = value[taxTypeId];
              const rows = [];
              for (const taxReturn of taxReturns) {
                let provisionalCol = null;
                if ('provisional' in taxReturn) {
                  if (taxReturn.provisional === true) {
                    provisionalCol = 'Provisional';
                  } else if (taxReturn.provisional === false) {
                    provisionalCol = 'Annual';
                  }
                }
                rows.push({
                  fromDate: taxReturn.returnPeriodFrom,
                  toDate: taxReturn.returnPeriodTo,
                  status: taxReturn.status,
                  statusType: taxReturn.statusType,
                  statusDescription: taxReturn.statusDescription,
                  applicationType: taxReturn.applicationType,
                  returnAppliedDate: taxReturn.returnAppliedDate,
                  provisional: provisionalCol,
                });
              }
              clientOutput[taxTypes[taxTypeId]] = rows;
            }
            csvOutput[clientIdentifier] = clientOutput;
          }
        }
      }
      const columns = new Map([
        ['client', 'Client'],
        ['taxType', 'Tax type'],
        ['fromDate', 'Period from'],
        ['toDate', 'Period to'],
        ['status', 'Status'],
        ['statusType', 'Status type'],
        ['statusDescription', 'Status description'],
        ['applicationType', 'Application Type'],
        ['returnAppliedDate', 'Return applied date'],
        ['provisional', 'Provisional/Annual'],
      ]);
      const rows = objectToCsvTable(csvOutput, columns);
      return unparseCsv(rows);
    }
    const json = {};
    for (const client of clients) {
      if (client.id in clientOutputs) {
        const output = clientOutputs[client.id];
        let jsonClient = { id: client.id };
        if (!anonymizeClients) {
          jsonClient = Object.assign(jsonClient, {
            name: client.name,
            username: client.username,
          });
        }
        if (output.value !== null) {
          json[client.id] = {
            client: jsonClient,
            actionId: output.actionId,
            taxReturns: output.value,
            error: output.error,
          };
        } else {
          json[client.id] = null;
        }
      }
    }
    return writeJson(json);
  },
});

async function getAckReceiptData(
  taxTypeId: TaxTypeNumericalCode,
  taxReturn: TaxReturn,
): Promise<AcknowledgementReceiptData> {
  const doc = await getDocumentByAjax({
    ...generateAckReceiptRequest(taxTypeId, taxReturn.referenceNo),
    method: 'post',
  });
  const receiptData = await getDataFromReceipt(doc, 'ack_receipt');
  return receiptData;
}

type AckReceiptsDataByReferenceNumber = { [referenceNumber: string]: AcknowledgementReceiptData };

CheckAccountApprovalStatusClientAction.Runner = class extends ReturnHistoryReturnDependentRunner<
  AccountApprovalStatusClientAction.Input,
  AccountApprovalStatusClientAction.Output
  > {
  /** Data extracted from acknowledgement receipts stored by tax type ID. */
  allAckReceiptsData: {
    [taxTypeId in TaxTypeNumericalCode]?: AckReceiptsDataByReferenceNumber
  } = {};

  constructor() {
    super(CheckAccountApprovalStatusClientAction);
    this.taxTypeTaskTitle = taxType => `Check approval status for ${taxType} accounts`;
    this.returnDependentFunc = this.getAckReceiptDataForReturns;

    this.shouldRunReturnDependentFuncOnTaxType = ({ input, taxTypeId }) => {
      // TODO: Cache checking input
      const { value: getAckReceipts } = getInput(input, 'getAckReceipts');
      return getAckReceipts && taxTypeId === TaxTypeNumericalCode.ITX;
    };
  }

  async getAckReceiptDataForReturns({
    taxTypeId,
    returns,
    task,
  }: ReturnDependentFnOptions) {
    const failedReturns = [];
    task.status = `Extract information from ${returns.length} acknowledgement of returns receipt(s)`;
    const taxTypeTask = await createTask(store, {
      title: 'Extract extra information from acknowledgement of returns receipts',
      parent: task.id,
    });
    const responses = await parallelTaskMap({
      list: returns,
      task: taxTypeTask,
      func: async (taxReturn, parentTaskId) => {
        const receiptDataTask = await createTask(store, {
          title: `Extract info from receipt ${taxReturn.referenceNo}`,
          parent: parentTaskId,
          unknownMaxProgress: false,
          progressMax: 1,
        });
        return taskFunction({
          task: receiptDataTask,
          func: () => getAckReceiptData(taxTypeId, taxReturn),
        });
      },
    });
    const dataFromReceipts: AckReceiptsDataByReferenceNumber = {};
    for (const response of responses) {
      if (response.value) {
        dataFromReceipts[response.item.referenceNo] = response.value;
      } else {
        failedReturns.push(response.item);
      }
    }
    this.allAckReceiptsData[taxTypeId] = dataFromReceipts;
    return failedReturns;
  }

  async runInternal() {
    await super.runInternal();

    const output: AccountApprovalStatusClientAction.Output = {};
    for (const taxTypeId of Object.keys(this.taxTypeReturns)) {
      const taxReturns = this.taxTypeReturns[taxTypeId];
      const taxTypeOutput = [];
      for (const taxReturn of taxReturns) {
        // All status' have '*' at the end. Remove it.
        const status = <FinancialAccountStatus>taxReturn.status.replace('*', '');
        const statusType = getFinancialAccountStatusType(status);

        const item: TaxReturnExtended = {
          ...taxReturn,
          status,
          statusType: financialAccountStatusTypeNames[statusType],
          statusDescription: financialAccountStatusDescriptionsMap[status],
        };

        const ackReceiptsData: AcknowledgementReceiptData | undefined = get(
          this.allAckReceiptsData,
          [taxTypeId, taxReturn.referenceNo].join('.'),
        );
        if (typeof ackReceiptsData !== 'undefined') {
          item.provisional = ackReceiptsData.provisional;
        }

        taxTypeOutput.push(item);
      }
      output[taxTypeId] = taxTypeOutput;
    }
    this.setOutput(output);
  }

  getRetryReasons() {
    const reasons = super.getRetryReasons();
    if (this.anyReturnsFailed()) {
      reasons.push('Some acknowledgement receipts could not be retrieved');
    }
    return reasons;
  }
};
export default CheckAccountApprovalStatusClientAction;
