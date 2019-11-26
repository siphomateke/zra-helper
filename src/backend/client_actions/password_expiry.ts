import {
  createClientAction, ClientActionRunner, createOutputFile, BasicRunnerInput, BaseFormattedOutput,
} from './base';
import { taskFunction, getClientIdentifier } from './utils';
import { getPasswordExpiryDate } from './user';
import moment from 'moment';
import { ExportFormatCode } from '../constants';
import { objectToCsvTable, unparseCsv, writeJson } from '../file_utils';
import { ClientActionOutputs, ClientActionOutput } from '@/store/modules/client_actions/types';

export namespace PasswordExpiryDateAction {
  export type Input = BasicRunnerInput;
  export type Output = {
    dateStr: string,
    date: number,
  };
}

namespace FormattedOutput {
  export namespace CSV {
    export interface Row {
      client: string;
      clientUsername: string;
      expiryDate: string;
    }
    export type Output = {
      [clientIdentifier: string]: Row[];
    };
  }

  export namespace JSON {
    export interface ClientOutput {
      client: BaseFormattedOutput.JSON.Client;
      actionId: string;
      expiryDate: number;
      expiryDateStr: string;
      error: ClientActionOutput<PasswordExpiryDateAction.Output>['error'];
    }
    export type Output = BaseFormattedOutput.JSON.Output<ClientOutput>;
  }
}

const CheckPasswordExpiryDateAction = createClientAction<
  PasswordExpiryDateAction.Input,
  PasswordExpiryDateAction.Output
>({
  id: 'checkPasswordExpiryDate',
  name: 'Check password expiry date',
  usesLoggedInTab: true,
  hasOutput: true,
  generateOutputFiles({ clients, outputs }) {
    return createOutputFile<ClientActionOutputs<PasswordExpiryDateAction.Output>>({
      label: 'Expiry dates of all clients passwords',
      filename: 'passwordExpiryDates',
      value: outputs,
      formats: [ExportFormatCode.CSV, ExportFormatCode.JSON],
      defaultFormat: ExportFormatCode.CSV,
      formatter({ output: clientOutputs, format, anonymizeClients }) {
        let sortedOutputs: {
          clientId: number,
          value: PasswordExpiryDateAction.Output | null
        }[] = [];
        for (const client of clients) {
          if (client.id in clientOutputs) {
            const { value } = clientOutputs[client.id];
            sortedOutputs.push({ clientId: client.id, value });
          }
        }
        sortedOutputs = sortedOutputs.sort(({ value: a }, { value: b }) => {
          if (a !== null && b !== null) {
            return a.date - b.date;
          }
          return -1;
        });
        const sortedClients = sortedOutputs.map(o => clients.find(c => c.id === o.clientId));

        if (format === ExportFormatCode.CSV) {
          const csvOutput: FormattedOutput.CSV.Output = {};
          for (const client of sortedClients) {
            if (client.id in clientOutputs) {
              const { value } = clientOutputs[client.id];
              if (value) {
                const clientIdentifier = getClientIdentifier(client, anonymizeClients);
                const clientUsername = anonymizeClients ? '' : client.username;
                csvOutput[clientIdentifier] = [{
                  client: clientIdentifier,
                  clientUsername,
                  expiryDate: value.dateStr,
                }];
              } else {
                // TODO: Show errors
              }
            }
          }
          const columns = [
            ['client', 'Client'],
          ];
          if (!anonymizeClients) {
            columns.push(['clientUsername', 'Username']);
          }
          columns.push(['expiryDate', 'Expiry date']);
          const rows = objectToCsvTable(csvOutput, new Map(columns));
          return unparseCsv(rows);
        }
        const json: FormattedOutput.JSON.Output = {};
        for (const client of sortedClients) {
          if (client.id in clientOutputs) {
            const output = clientOutputs[client.id];
            let jsonClient: BaseFormattedOutput.JSON.Client = { id: client.id };
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
                expiryDate: output.value.date,
                expiryDateStr: output.value.dateStr,
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

CheckPasswordExpiryDateAction.Runner = class extends ClientActionRunner<
  PasswordExpiryDateAction.Input,
  PasswordExpiryDateAction.Output
  > {
  failures: {} = {};

  constructor() {
    super(CheckPasswordExpiryDateAction);
  }

  async runInternal() {
    const { task: actionTask, loggedInTabId } = this.storeProxy;
    actionTask.unknownMaxProgress = false;
    actionTask.progressMax = 2;

    // TODO: Add retrying
    await taskFunction({
      task: actionTask,
      setStateBasedOnChildren: true,
      func: async () => {
        const response = await getPasswordExpiryDate(loggedInTabId);
        if ('expiryDate' in response) {
          const expiryDateStr = response.expiryDate;
          const expiryDate = moment(expiryDateStr, 'DD/MM/YYYY hh:mm:ss');
          this.setOutput({ dateStr: expiryDateStr, date: expiryDate.valueOf() });
        } else {
          throw new Error('Response from tab did not contain a password expiry date');
        }
      },
    });
  }

  getInitialFailuresObj() {
    return {};
  }

  getRetryInput() {
    return {};
  }
};

export default CheckPasswordExpiryDateAction;
