import moment from 'moment';
import taxPayerLedgerLogic from './logic';
import { ClientActionRunner, createClientAction, createOutputFile } from '../base';
import { taskFunction, parallelTaskMap, getClientIdentifier } from '../utils';
import createTask from '@/transitional/tasks';
import { taxTypes, exportFormatCodes, taxTypeNumericalCodesArray } from '@/backend/constants';
import store from '@/store';
import { unparseCsv, writeJson } from '@/backend/file_utils';
import { pendingLiabilityColumnNamesMap, pendingLiabilityTypes, pendingLiabilityColumns } from '../pending_liabilities';

/**
 * @typedef {import('@/backend/constants').Date} Date
 * @typedef {import('../pending_liabilities').TotalsByTaxTypeCode} TotalsByTaxTypeCode
 */

/* eslint-disable max-len */
/**
 * @typedef {Object} RunnerInput
 * @property {import('@/backend/client_actions/pending_liabilities').ParsedPendingLiabilitiesOutput[]} previousPendingLiabilities
 * @property {Date} previousDate
 * @property {Date} currentDate
 */
/* eslint-enable max-len */

/**
 *
 * @param {Object} options
 * @param {import('@/backend/constants').Client[]} options.clients
 * @param {import('@/store/modules/client_actions').ClientActionOutputs} options.output
 * @param {import('@/backend/constants').ExportFormatCode} options.format
 * @param {boolean} options.anonymizeClients
 */
// FIXME: Handle errors that occurred when getting the output. E.g. pending liabilities missing.
function outputFormatter({
  clients,
  output: clientOutputs,
  format,
  anonymizeClients,
}) {
  if (format === exportFormatCodes.CSV) {
    const rows = [];
    // TODO: Don't depend on getting input from first client. Somehow get original user input.
    if (clients.length === 0) return '';
    if (!(clients[0].id in clientOutputs)) return '';
    /** @type {ChangeReasonsActionOutput} */
    const firstOutput = clientOutputs[clients[0].id].value;
    if (firstOutput === null) return '';

    const numberOfColumns = 14;
    const headers = [];
    for (let i = 0; i < numberOfColumns; i++) {
      headers.push('');
    }
    headers[1] = `Previous week ending ${firstOutput.previousDate}`;
    headers[6] = 'Reason for movement';
    headers[9] = `Current week ending ${firstOutput.currentDate}`;
    rows.push(headers);

    const pendingLiabilityColumnNames = Object.values(pendingLiabilityColumnNamesMap);
    const subHeaders = [
      'Client',
      'Tax type',
      ...pendingLiabilityColumnNames,
      ...pendingLiabilityTypes.map(t => pendingLiabilityColumnNamesMap[t]),
      'Tax type',
      ...pendingLiabilityColumnNames,
    ];
    rows.push(subHeaders);

    for (const client of clients) {
      let i = 0;
      let outputValue = null;
      if (client.id in clientOutputs) {
        /** @type {import('@/store/modules/client_actions').ClientActionOutput} */
        const output = clientOutputs[client.id];
        /** @type {ChangeReasonsActionOutput} */
        outputValue = output.value;
      }
      for (const taxTypeId of taxTypeNumericalCodesArray) {
        const taxTypeCode = taxTypes[taxTypeId];
        let firstCol = '';
        if (i === 0) {
          firstCol = getClientIdentifier(client, anonymizeClients);
        }
        const row = [firstCol, taxTypeCode];
        if (outputValue !== null && taxTypeId in outputValue.taxTypes) {
          const reasonsResponse = outputValue.taxTypes[taxTypeId];
          // Note: The pending liabilities action's output uses tax type codes, not IDs.
          const previousTotals = outputValue.previousTotals[taxTypeCode];
          for (const liabilityColumn of pendingLiabilityColumns) {
            const total = previousTotals[liabilityColumn];
            row.push(total);
          }

          for (const liabilityType of pendingLiabilityTypes) {
            const reasons = reasonsResponse.changeReasonsByLiability[liabilityType];
            row.push(reasons);
          }

          row.push(taxTypeCode);
          // Note: The pending liabilities action's output uses tax type codes, not IDs.
          const currentTotals = outputValue.currentTotals[taxTypeCode];
          for (const liabilityColumn of pendingLiabilityColumns) {
            const total = currentTotals[liabilityColumn];
            row.push(total);
          }
        }
        if (typeof row[9] === 'undefined') {
          row[9] = taxTypeCode;
        }
        // Fill empty columns
        while (row.length < numberOfColumns) {
          row.push('');
        }
        rows.push(row);
        i++;
      }
    }

    return unparseCsv(rows);
  }
  const json = {};
  // TODO: Share code with pending liabilities
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
      /** @type {ChangeReasonsActionOutput} */
      const outputValue = output.value;
      if (outputValue !== null) {
        json[client.id] = {
          client: jsonClient,
          error: output.error,
          ...outputValue,
        };
      } else {
        json[client.id] = null;
      }
    }
  }
  return writeJson(json);
}

const PendingLiabilityChangeReasonsClientAction = createClientAction({
  id: 'pendingLiabilityChangeReasons',
  name: 'Get reasons for pending liabilities',
  requiresTaxTypes: true,
  requiredActions: ['getAllPendingLiabilities', 'taxPayerLedger'],
  defaultInput: () => {
    const today = moment();
    const weekAgo = today.clone().subtract(7, 'days');
    return {
      previousDate: weekAgo.format('DD/MM/YYYY'),
      currentDate: today.format('DD/MM/YYYY'),
    };
  },
  inputValidation: {
    currentDate: 'required|date_format:dd/MM/yyyy|after:previousDate,true',
    previousDate: 'required|date_format:dd/MM/yyyy|before:currentDate,true',
    previousPendingLiabilities: 'required|parsedPendingLiabilitiesOutput',
  },
  hasOutput: true,
  generateOutputFiles({ clients, outputs }) {
    return createOutputFile({
      label: 'Pending liability changes',
      filename: 'pendingLiabilityChanges',
      formats: [exportFormatCodes.CSV, exportFormatCodes.JSON],
      value: outputs,
      formatter: options => outputFormatter(Object.assign({ clients }, options)),
    });
  },
});

/**
 * @typedef {Object} ChangeReasonsActionOutput
 * @property {Date} previousDate
 * @property {Date} currentDate
 * @property {TotalsByTaxTypeCode} previousTotals
 * @property {TotalsByTaxTypeCode} currentTotals
 * @property {Object.<string, import('./logic').TaxPayerLedgerLogicFnResponse>} taxTypes
 * Change reason response by tax type Id.
 */

PendingLiabilityChangeReasonsClientAction.Runner = class extends ClientActionRunner {
  constructor() {
    super(PendingLiabilityChangeReasonsClientAction);
    this.records = [];
  }

  // FIXME: Handle `previousPendingLiabilities` not existing
  getPreviousPendingLiabilities() {
    /** @type {{input: RunnerInput, client: import('@/backend/constants').Client}} */
    const { client, input } = this.storeProxy;
    const match = input.previousPendingLiabilities.find(item => item.client === client.name);
    if (match) {
      return match.totals;
    }
    return null;
  }

  async runInternal() {
    const { task: parentTask, client } = this.storeProxy;
    // FIXME: Set ledger action dates
    // We have to get all records in case a transaction recently references a very old one.
    /* const fromDate = '01/01/2013';
    const toDate = moment().format('DD/MM/YYYY'); */
    /** @type {{input: RunnerInput}} */
    const { input } = this.storeProxy;
    const previousDate = moment(input.previousDate, 'DD/MM/YYYY');
    const currentDate = moment(input.currentDate, 'DD/MM/YYYY');

    const previousPendingLiabilityTotals = this.getPreviousPendingLiabilities();
    /** @type {import('../pending_liabilities').ParsedPendingLiabilitiesOutput} */
    // TODO: Allow uploading old pending liabilities instead of getting them at runtime
    const currentPendingLiabilitiesOutput = this.getInstance('getAllPendingLiabilities').output;
    /** @type {import('./index').LedgerOutput} */
    const recordsByTaxTypeId = this.getInstance('taxPayerLedger').output;

    /** @type {ChangeReasonsActionOutput} */
    const output = {
      previousDate: previousDate.format('DD-MM-YY'),
      currentDate: currentDate.format('DD-MM-YY'),
      previousTotals: previousPendingLiabilityTotals,
      currentTotals: currentPendingLiabilitiesOutput.totals,
      taxTypes: {},
    };

    // Run on each tax account
    await parallelTaskMap({
      task: parentTask,
      list: client.registeredTaxAccounts,
      /**
       * @param {import('../utils').TaxAccount} taxAccount
       */
      async func(taxAccount, parentTaskId) {
        const { taxTypeId } = taxAccount;
        const taxTypeCode = taxTypes[taxTypeId];
        const taxAccountTask = await createTask(store, {
          title: `Find reasons for ${taxTypeCode} pending liability change`,
          parent: parentTaskId,
        });
        return taskFunction({
          task: taxAccountTask,
          async func() {
            // TODO: Update task status based on logic progress
            const reasonsResponse = await taxPayerLedgerLogic({
              client,
              parentTaskId,
              taxTypeId,
              previousDate: previousDate.valueOf(),
              currentDate: currentDate.valueOf(),
              previousPendingLiabilityTotals: previousPendingLiabilityTotals[taxTypeCode],
              currentPendingLiabilityTotals: currentPendingLiabilitiesOutput.totals[taxTypeCode],
              taxPayerLedgerRecords: recordsByTaxTypeId[taxTypeId],
            });

            output.taxTypes[taxTypeId] = reasonsResponse;
          },
        });
      },
    });

    this.storeProxy.output = output;
  }
};
export default PendingLiabilityChangeReasonsClientAction;
