import { get } from 'dot-prop';
import { createClientAction, getInput, createOutputFile } from '../base';
import { GetReturnHistoryClientActionOptions, ReturnHistoryReturnDependentRunner } from './base';
import {
  taxTypeNumericalCodes,
  taxTypes,
  financialAccountStatusTypesMap,
  financialAccountStatusDescriptionsMap,
  financialAccountStatusTypeNames,
  exportFormatCodes,
} from '@/backend/constants';
import { getClientIdentifier, parallelTaskMap, taskFunction } from '../utils';
import { unparseCsv, objectToCsvTable, writeJson } from '@/backend/file_utils';
import { getDocumentByAjax } from '@/backend/utils';
import { generateAckReceiptRequest } from './ack_receipt';
import getDataFromReceipt from '@/backend/content_scripts/helpers/receipt_data';
import createTask from '@/transitional/tasks';
import store from '@/store';

/* eslint-disable max-len */
/**
 * @typedef {import('./base').TaxReturn} TaxReturn
 * @typedef {import('@/backend/constants').FinancialAccountStatus} FinancialAccountStatus
 * @typedef {import('@/backend/content_scripts/helpers/receipt_data').AcknowledgementReceiptData} AcknowledgementReceiptData
 * @typedef {import('@/backend/constants').TaxTypeNumericalCode} TaxTypeNumericalCode
 */
/* eslint-enable max-len */

/**
 *
 * @param {FinancialAccountStatus} status
 */
function getFinancialAccountStatusType(status) {
  for (const type of Object.keys(financialAccountStatusTypesMap)) {
    if (financialAccountStatusTypesMap[type].includes(status)) {
      return type;
    }
  }
  return null;
}

/**
 * @typedef {Object} TaxReturnExtended_Temp
 * @property {FinancialAccountStatus} status Financial account status code
 * @property {import('@/backend/constants').FinancialAccountStatusType} statusType
 * @property {string} statusDescription
 * @property {boolean} [provisional] Provisional or annual
 *
 * @typedef {TaxReturn & TaxReturnExtended_Temp} TaxReturnExtended
 * Tax return with extra information such as financial account status code.
 */

/**
 * @typedef {Object.<string, TaxReturnExtended[]>} RunnerOutput
 * By tax type ID.
 * TODO: Set key as tax type ID when using TypeScript.
 */

const CheckAccountApprovalStatusClientAction = createClientAction({
  ...GetReturnHistoryClientActionOptions,
  id: 'checkAccountApprovalStatus',
  name: 'Check account approval status',
  defaultInput: () => ({
    ...GetReturnHistoryClientActionOptions.defaultInput(),
    taxTypeIds: [taxTypeNumericalCodes.ITX],
    getAckReceipts: false,
  }),
  inputValidation: {
    ...GetReturnHistoryClientActionOptions.inputValidation,
    getAckReceipts: 'required',
  },
  hasOutput: true,
  generateOutputFiles({ clients, outputs }) {
    return createOutputFile({
      label: 'All clients account approval statuses',
      value: outputs,
      defaultFormat: exportFormatCodes.CSV,
      formats: [exportFormatCodes.CSV, exportFormatCodes.JSON],
      formatter({
        output: clientOutputs,
        format,
        anonymizeClients,
      }) {
        // TODO: Only include provisional column if `getAckReceipts` is true
        if (format === exportFormatCodes.CSV) {
          const csvOutput = {};
          for (const client of clients) {
            if (client.id in clientOutputs) {
              /** @type {{value: RunnerOutput}} */
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
  },
});

/**
 * @param {import('@/backend/constants').TaxTypeNumericalCode} taxTypeId
 * @param {TaxReturn} taxReturn
 * @returns {Promise.<AcknowledgementReceiptData>}
 */
async function getAckReceiptData(taxTypeId, taxReturn) {
  const doc = await getDocumentByAjax({
    ...generateAckReceiptRequest(taxTypeId, taxReturn.referenceNo),
    method: 'post',
  });
  const receiptData = await getDataFromReceipt(doc, 'ack_receipt');
  return receiptData;
}

/**
 * @typedef {Object.<string, AcknowledgementReceiptData>} AckReceiptsDataByReferenceNumber
 */

CheckAccountApprovalStatusClientAction.Runner = class extends ReturnHistoryReturnDependentRunner {
  constructor() {
    super(CheckAccountApprovalStatusClientAction);
    this.taxTypeTaskTitle = taxType => `Check approval status for ${taxType} accounts`;
    this.returnDependentFunc = this.getAckReceiptDataForReturns;

    /**
     * Data extracted from acknowledgement receipts stored by tax type ID.
     * TODO: TypeScript: keys are TaxTypeNumericalCodes
     * @type {Object.<string, AckReceiptsDataByReferenceNumber>}
     */
    this.allAckReceiptsData = {};

    this.shouldRunReturnDependentFuncOnTaxType = ({ input, taxTypeId }) => {
      // TODO: Cache checking input
      const { value: getAckReceipts } = getInput(input, 'getAckReceipts');
      return getAckReceipts && taxTypeId === taxTypeNumericalCodes.ITX;
    };
  }

  async getAckReceiptDataForReturns({
    taxTypeId,
    returns,
    task,
  }) {
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
    /** @type {AckReceiptsDataByReferenceNumber} */
    const dataFromReceipts = {};
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

    /** @type {RunnerOutput} */
    const output = {};
    for (const taxTypeId of Object.keys(this.taxTypeReturns)) {
      const taxReturns = this.taxTypeReturns[taxTypeId];
      const taxTypeOutput = [];
      for (const taxReturn of taxReturns) {
        // All status' have '*' at the end. Remove it.
        const status = taxReturn.status.replace('*', '');
        const statusType = getFinancialAccountStatusType(status);

        /** @type {TaxReturnExtended} */
        const item = {
          ...taxReturn,
          status,
          statusType: financialAccountStatusTypeNames[statusType],
          statusDescription: financialAccountStatusDescriptionsMap[status],
        };

        /** @type {AcknowledgementReceiptData|undefined} */
        const ackReceiptsData = get(
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
