import { createClientAction } from '../base';
import { GetReturnHistoryClientActionOptions, ReturnHistoryRunner } from './base';
import {
  taxTypeNumericalCodes,
  taxTypes,
  financialAccountStatusTypesMap,
  financialAccountStatusDescriptionsMap,
  financialAccountStatusTypeNames,
  exportFormatCodes,
} from '@/backend/constants';
import { getClientIdentifier } from '../utils';
import { unparseCsv, objectToCsvTable, writeJson } from '@/backend/file_utils';

/**
 * @typedef {import('./base').TaxReturn} TaxReturn
 * @typedef {import('@/backend/constants').FinancialAccountStatus} FinancialAccountStatus
 */

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
 * @typedef {Object} TaxReturnWithStatusCode_Temp
 * @property {FinancialAccountStatus} status Financial account status code
 * @property {import('@/backend/constants').FinancialAccountStatusType} statusType
 * @property {string} statusDescription
 *
 * @typedef {TaxReturn & TaxReturnWithStatusCode_Temp} TaxReturnWithStatusCode
 */

/**
 * @typedef {Object.<string, TaxReturnWithStatusCode[]>} RunnerOutput
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
  }),
  hasOutput: true,
  defaultOutputFormat: exportFormatCodes.CSV,
  outputFormats: [exportFormatCodes.CSV, exportFormatCodes.JSON],
  outputFormatter({
    clients,
    outputs: clientOutputs,
    format,
    anonymizeClients,
  }) {
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
                rows.push({
                  fromDate: taxReturn.returnPeriodFrom,
                  toDate: taxReturn.returnPeriodTo,
                  status: taxReturn.status,
                  statusType: taxReturn.statusType,
                  statusDescription: taxReturn.statusDescription,
                  applicationType: taxReturn.applicationType,
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
CheckAccountApprovalStatusClientAction.Runner = class extends ReturnHistoryRunner {
  constructor() {
    super(CheckAccountApprovalStatusClientAction);
    this.taxTypeTaskTitle = taxType => `Check approval status for ${taxType} accounts`;
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
        const item = {
          ...taxReturn,
          status,
          statusType: financialAccountStatusTypeNames[statusType],
          statusDescription: financialAccountStatusDescriptionsMap[status],
        };
        taxTypeOutput.push(item);
      }
      output[taxTypeId] = taxTypeOutput;
    }
    this.storeProxy.output = output;
  }
};
export default CheckAccountApprovalStatusClientAction;
