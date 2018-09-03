import moment from 'moment';
import config from '../config';
import { taxTypes } from '../constants';
import { TaxTypeNotFoundError } from '../errors';
import { Task, taskStates } from '../tasks';
import { getDocumentByAjax } from '../utils';
import { ClientAction } from './base';
import { parseTableAdvanced } from '../content_scripts/helpers/zra';
import { downloadReceipt, parallelTaskMap } from './utils';

/**
 * @typedef {import('../constants').Client} Client
 * @typedef {import('./base').Output} Output
 */

const exciseTypes = {
  airtime: '20025012',
  electricalEnergy: '20025007',
  opaqueBeer: '20025011',
  otherThanOpaqueBeer: '20025008',
  fuelTerminal: '20025010',
  spiritsAndWine: '20025009',
};

const recordHeaders = [
  'srNo',
  'referenceNo',
  'searchCode',
  'returnPeriodFrom',
  'returnPeriodTo',
  'returnAppliedDate',
  'accountName',
  'applicationType',
  'status',
  'appliedThrough',
  'receipt',
  'submittedForm',
];

async function getReturnHistoryReferenceNumbers({
  tpin, taxType, fromDate, toDate, page, exciseType,
}) {
  const doc = await getDocumentByAjax({
    url: 'https://www.zra.org.zm/retHist.htm',
    method: 'post',
    data: {
      'retHistVO.fromDate': fromDate,
      'retHistVO.toDate': toDate,
      'retHistVO.rtnackNo': '',
      'retHistVO.rtnType': taxType,
      'retHistVO.rtnTypeExc': exciseType,
      'retHistVO.tinNo': tpin,
      currentPage: page,
      actionCode: 'dealerReturnsView',
      dispatch: 'dealerReturnsView',
    },
  });

  try {
    return await parseTableAdvanced({
      root: doc,
      headers: recordHeaders,
      tableInfoSelector: '#ReturnHistoryForm>table:nth-child(8)>tbody>tr>td',
      recordSelector: '#ReturnHistoryForm>table.FORM_TAB_BORDER.marginStyle>tbody>tr.whitepapartd.borderlessInput',
      noRecordsString: 'No Data Found',
    });
  } catch (error) {
    if (error.type === 'TableError' && error.code === 'NoRecordsFound') {
      throw new TaxTypeNotFoundError(`Tax type with id "${taxType}" not found`, null, {
        taxTypeId: taxType,
      });
    } else {
      throw error;
    }
  }
}

async function getAllReturnHistoryReferenceNumbers({
  tpin, taxType, fromDate, toDate, exciseType, parentTask,
}) {
  const task = new Task('Get reference numbers', parentTask.id);
  task.progressMax = 1;
  task.status = 'Getting reference numbers from first page';

  let numPages = 1;
  const referenceNumbers = [];
  try {
    // TODO: Consider doing this in parallel
    for (let page = 0; page < numPages; page++) {
      const result = await getReturnHistoryReferenceNumbers({
        tpin,
        taxType,
        fromDate,
        toDate,
        page: page + 1,
        exciseType,
      });

      if (page > 0) {
        task.addStep(`Getting reference numbers from page ${(page + 1)}/${numPages}`);
      } else {
        task.progress++;
      }

      for (const record of result.records) {
        if (record.appliedThrough.toLowerCase() === 'online') {
          referenceNumbers.push(record.referenceNo);
        }
      }

      if (result.numPages <= 1) {
        break;
      } else {
        numPages = result.numPages;
        task.progressMax = numPages;
      }
    }
    task.state = taskStates.SUCCESS;
    task.status = '';
  } catch (error) {
    task.setError(error);
    throw error;
  } finally {
    task.complete = true;
  }
  return referenceNumbers;
}

function downloadReturnHistoryReceipt({
  client, taxType, referenceNumber, parentTask,
}) {
  return downloadReceipt({
    type: 'return',
    filename: `receipt-${client.username}-${taxType}-${referenceNumber}.mhtml`,
    taskTitle: `Download receipt ${referenceNumber}`,
    parentTask,
    createTabPostOptions: {
      url: 'https://www.zra.org.zm/retHist.htm',
      data: {
        actionCode: 'printReceipt',
        flag: 'rtnHistRcpt',
        ackNo: referenceNumber,
        rtnType: taxType,
      },
    },
  });
}

function downloadReceipts({
  client, taxType, referenceNumbers, parentTask,
}) {
  return parallelTaskMap({
    list: referenceNumbers,
    task: new Task('Download receipts', parentTask.id),
    func(referenceNumber, parentTask) {
      return downloadReturnHistoryReceipt({
        client, taxType, referenceNumber, parentTask,
      });
    },
  });
}

export default new ClientAction('Get all returns', 'get_all_returns',
  /**
   * @param {Client} client
   * @param {Task} parentTask
   */
  (async (client, parentTask) => {
    const initialMaxOpenTabs = config.maxOpenTabs;
    config.maxOpenTabs = 3;

    await parallelTaskMap({
      list: Object.keys(taxTypes),
      task: parentTask,
      autoCalculateTaskState: false,
      async func(taxTypeId, parentTask) {
        const taxType = taxTypes[taxTypeId];

        const task = new Task(`Get ${taxType} receipts`, parentTask.id);
        task.unknownMaxProgress = false;
        task.progressMax = 2;
        try {
          const referenceNumbers = await getAllReturnHistoryReferenceNumbers({
            tpin: client.username,
            taxType: taxTypeId,
            fromDate: '01/01/2013',
            toDate: moment().format('31/12/YYYY'),
            exciseType: exciseTypes.airtime,
            parentTask: task,
          });
          await downloadReceipts({
            taxType: taxTypeId,
            referenceNumbers,
            parentTask: task,
            client,
          });
          task.status = '';
          if (task.childStateCounts[taskStates.WARNING] > 0) {
            task.state = taskStates.WARNING;
          } else {
            task.state = taskStates.SUCCESS;
          }
        } catch (error) {
          task.setError(error);
        } finally {
          task.complete = true;
        }
      },
    });

    config.maxOpenTabs = initialMaxOpenTabs;

    let errorCount = 0;
    let taxTypeErrorCount = 0;
    for (const task of parentTask.getChildren()) {
      if (task.state === taskStates.ERROR) {
        if (task.error.type !== 'TaxTypeNotFoundError') {
          errorCount++;
        } else {
          taxTypeErrorCount++;
        }
      }
    }
    if (errorCount > 0) {
      parentTask.state = taskStates.ERROR;
    } else if (taxTypeErrorCount === parentTask.children.length) {
      // If all sub tasks don't have a tax type, something probably went wrong
      parentTask.state = taskStates.WARNING;
      parentTask.status = 'No tax types found.';
    } else if (parentTask.childStateCounts[taskStates.WARNING] > 0) {
      parentTask.state = taskStates.WARNING;
    } else {
      parentTask.state = taskStates.SUCCESS;
    }
  }));
