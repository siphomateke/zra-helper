import { scaleZraAmount } from '@/backend/content_scripts/helpers/zra';
import { deepAssign } from '@/utils';
import moment from 'moment';
import Papa from 'papaparse';
import { getPeriodMonthsFromQuarter } from '../../utils';
import taxPayerLedgerLogic, {
  closingBalanceIsZero,
  findOriginalRecordOfReversal,
  getClosingBalances,
  getRecordsBySerialNumber,
  getRecordsInDateRange,
  pairRecords,
  parseDate,
  parseLedgerRecords,
  recordMatchesPayment,
  removeReversals,
  removeZeroRecords,
} from '../logic';
import {
  getNarrationType,
  narrationGroups,
  narrationTypes,
  narrationTypesByGroup,
} from '../narration';
import loadLedgerOutputCsv from './ledger_output';
import { loadFile, recordsToSerialNumbers } from './utils';

/**
 *
 * @param {string} filename
 * @param {boolean} hasHeaders
 * Whether the CSV has headers. If set to false, default headers will be used.
 * @returns {Promise.<import('@/backend/reports').TaxPayerLedgerRecord[]>}
 */
async function loadLedgerCsv(filename, hasHeaders = true) {
  const csv = await loadFile(filename);
  const records = Papa.parse(csv, {
    header: hasHeaders,
    skipEmptyLines: true,
  }).data;
  if (!hasHeaders) {
    const headers = ['srNo', 'transactionDate', 'fromDate', 'toDate', 'narration', 'debit', 'credit', 'cumulativeBalance'];
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const newRecord = {};
      for (let j = 0; j < headers.length; j++) {
        newRecord[headers[j]] = record[j];
      }
      records[i] = newRecord;
    }
  }
  return records;
}

/**
 * @returns {import('@/backend/reports').TaxPayerLedgerRecord}
 */
function createLedgerRecord({
  srNo = '0',
  transactionDate = '30/03/2015',
  fromDate = '01/01/2015',
  toDate = '31/12/2015',
  narration = '',
  debit = '0.00',
  credit = '0.00',
  cumulativeBalance = '',
}) {
  return {
    srNo,
    transactionDate,
    fromDate,
    toDate,
    narration,
    debit,
    credit,
    cumulativeBalance,
  };
}

async function loadAndParseLedger(filePath) {
  const ledgerRecords = await loadLedgerCsv(filePath);
  return parseLedgerRecords(ledgerRecords);
}

test('closing balance extraction', async () => {
  const parsedLedgerRecords = await loadAndParseLedger('ledger3.csv');
  const closingBalancesByPeriod = getClosingBalances(parsedLedgerRecords);
  const srNos = recordsToSerialNumbers(Object.values(closingBalancesByPeriod));
  expect(srNos).toEqual(['5', '10', '15', '19']);
});

describe('test ledger logic using actual ledger (ledger1.csv)', () => {
  let ledgerRecords;
  /** @type {import('../logic').ParsedTaxPayerLedgerRecord[]} */
  let parsedLedgerRecords;
  beforeAll(async () => {
    ledgerRecords = await loadLedgerCsv('./ledger1.csv');
    parsedLedgerRecords = parseLedgerRecords(ledgerRecords);
    // TODO: Make sure parsed ledger records is not accidentally modified between tests
  });

  // TODO: Add test for exactly a week ago
  it('get records from the past week', () => {
    const tests = [
      ['18/07/2016', '25/07/2016', ['36', '37']],
      ['26/07/2016', '02/08/2016', []],
      ['18/03/2014', '25/03/2015', []],
      ['01/10/2015', '08/10/2015', ['6']],
      // FIXME: Add better past week test cases
    ];
    for (const [previousDateString, currentDateString, expectedSerialNumbers] of tests) {
      const previousDate = moment(previousDateString, 'DD/MM/YYYY').valueOf();
      const currentDate = moment(currentDateString, 'DD/MM/YYYY').valueOf();
      const { withinDateRange: records } = getRecordsInDateRange(
        parsedLedgerRecords,
        previousDate,
        currentDate,
      );
      const serialNumbers = recordsToSerialNumbers(records);
      expect(serialNumbers.sort()).toEqual(expectedSerialNumbers.sort());
    }
  });

  describe('reversal matching', () => {
    it('finds the original record a reversal applies to', () => {
      const recordsBySrNo = new Map();
      for (const record of parsedLedgerRecords) {
        recordsBySrNo.set(record.srNo, record);
      }
      const tests = [
        ['18', '6'],
        ['21', '2'],
        ['24', '4'],
      ];
      for (const [srNo, expectedSrNo] of tests) {
        const record = findOriginalRecordOfReversal(recordsBySrNo, recordsBySrNo.get(srNo));
        expect(record.srNo).toBe(expectedSrNo);
      }
    });

    it('removes all reversals from the ledger', () => {
      const records = removeReversals(parsedLedgerRecords);
      const serialNumbers = recordsToSerialNumbers(records);
      expect(serialNumbers).toEqual(['28', '29', '30', '32', '35', '37', '39']);
    });
  });
});

describe('recordMatchesPayment', () => {
  const t = narrationTypes;
  function createRecordFromQuarter(data, quarter = null) {
    const record = deepAssign({ narration: { meta: {} } }, data);
    // FIXME: Generate from narration string
    record.narration.group = getNarrationType(record.narration.type);
    if (quarter !== null) {
      const { fromMonth, toMonth } = getPeriodMonthsFromQuarter(quarter);
      record.fromDate = parseDate(`01/${fromMonth}/13`);
      record.toDate = parseDate(`01/${toMonth}/13`);
      record.narration.meta.quarter = quarter;
    }
    return record;
  }
  function generatePayment(against, quarter = null) {
    return createRecordFromQuarter({
      narration: {
        type: t.PAYMENT,
        meta: { against },
      },
    }, quarter);
  }
  function generateRecordOfType(narrationType, quarter = null) {
    return createRecordFromQuarter({
      narration: { type: narrationType },
    }, quarter);
  }
  function recordAndPaymentMatch(record, payment) {
    const matchInfo = recordMatchesPayment(record, payment);
    expect(matchInfo.typeMatches).toBe(true);
  }
  it('uses the \'against\' part of payments to match them to records', () => {
    const tests = [
      ['principal liability', t.ORIGINAL_RETURN],
      ['principal liability', t.AMENDED_RETURN],
      ['interest', t.LATE_PAYMENT_INTEREST],
      ['payment penalty', t.LATE_PAYMENT_PENALTY],
      ['late return penalty', t.LATE_RETURN_PENALTY],
    ];
    for (const type of narrationTypesByGroup[narrationGroups.ASSESSMENTS]) {
      tests.push(['assessment liability', type]);
    }
    for (const type of narrationTypesByGroup[narrationGroups.PENALTY_ASSESSMENTS]) {
      tests.push(['assessment manual penalty', type]);
    }
    for (const [against, type] of tests) {
      const record = generateRecordOfType(type);
      const payment = generatePayment(against);
      recordAndPaymentMatch(record, payment);
    }
  });
  it('makes sure the quarters are equal too when comparing provisional returns to payments', () => {
    const provisionalReturnTypes = [t.PROVISIONAL_RETURN, t.REVISED_PROVISIONAL_RETURN];
    for (const type of provisionalReturnTypes) {
      for (let i = 0; i < 4; i++) {
        const quarter = i + 1;
        const record = generateRecordOfType(type, quarter);
        const payment = generatePayment('principal liability', quarter);
        recordAndPaymentMatch(record, payment);
      }
    }
  });
  // FIXME: Also test amount matching
});

describe('matching payments to records in actual ledgers', async () => {
  /**
   * @typedef {Object} MatchTest
   * @property {string} filename
   * @property {[string, string[], number][]} paymentMatches
   * This is a tuple containing information about which payments should be matched to which
   * records. The items are as follows:
   * 1. The serial number of a record that payments should be matched to
   * 2. An array of the serial numbers of the payments of the aforementioned record.
   * 3. The sum of the payments
   */
  // FIXME: Test advance payment matching too
  // FIXME: Add test for provisional return matching
  /** @type {MatchTest[]} */
  const tests = [{
    filename: 'ledger1.csv',
    paymentMatches: [
      ['28', ['29', '30', '32', '35', '37'], 453462],
    ],
  }, {
    filename: 'ledger2.csv',
    paymentMatches: [
      ['14', ['49'], 750], // FIXME: Verify this should be 49 and not 47
      ['15', ['17', '48'], 149.1],
      ['21', ['23', '46'], 120.64],
      ['20', ['47'], 750], // FIXME: Verify this should be 47 and not 49
      ['39', ['40', '41', '42', '43', '44', '45'], 174533.23],
    ],
  }, {
    filename: 'ledger3.csv',
    paymentMatches: [
      ['3', ['4'], 420],
      ['8', ['9'], 420],
      ['13', ['14'], 420],
      ['16', [], 0],
    ],
  }];
  for (const { filename, paymentMatches: matches } of tests) {
    test(filename, async () => {
      let parsedLedgerRecords = await loadAndParseLedger(filename);
      parsedLedgerRecords = removeReversals(parsedLedgerRecords);
      const pairedRecords = pairRecords(parsedLedgerRecords);
      for (const [paymentOfRecordSrNo, paymentSrNos, sum] of matches) {
        const records = getRecordsBySerialNumber(pairedRecords);
        const paymentOfRecord = records.get(paymentOfRecordSrNo);
        expect(paymentOfRecord.payments).toEqual(paymentSrNos);
        expect(paymentOfRecord.paymentsSum).toBe(scaleZraAmount(sum));
        for (const paymentSrNo of paymentSrNos) {
          expect(records.get(paymentSrNo).paymentOf).toBe(paymentOfRecordSrNo);
        }
      }
    });
  }
});

test('removeZeroRecords removes all records with a balance of zero', async () => {
  /** @type {Array<[string,Array<string>]>} */
  const tests = [
    [
      './example4_ledger.csv',
      ['50', '51', '52', '55', '56', '57', '58', '63', '64', '65', '68', '69', '70', '71'],
    ],
    [
      './example2_ledger.csv',
      ['9', '10', '11', '12', '13', '14', '15'],
    ],
  ];
  await Promise.all(tests.map(([filename, expectedSerialNumbers]) => (async () => {
    const ledgerRecords = await loadLedgerCsv(filename, false);
    const parsedLedgerRecords = parseLedgerRecords(ledgerRecords);
    const records = removeZeroRecords(parsedLedgerRecords);
    const serialNumbers = recordsToSerialNumbers(records);
    expect(serialNumbers).toEqual(expectedSerialNumbers);
  })()));
});

test('closingBalanceIsZero returns true only when debit or credit is 0', () => {
  /**
   * Debit, credit and whether the closing balance is zero.
   * @type {([string, string, boolean])[]}
   */
  const tests = [
    ['0.00', '', true],
    ['', '0.00', true],
    ['0.00', '0.00', true],
    ['600.00', '0.00', false],
    ['600.00', '200.00', false],
    ['0.00', '200.00', false],
    ['', '200.00', false],
  ];
  for (const [debit, credit, expected] of tests) {
    const closingBalanceRecord = createLedgerRecord({
      narration: 'Closing Balance - 01/01/2018 to 31/12/2018',
      debit,
      credit,
    });
    const [parsedClosingBalanceRecord] = parseLedgerRecords([closingBalanceRecord]);
    expect(closingBalanceIsZero(parsedClosingBalanceRecord)).toBe(expected);
  }
});

describe('get records in date range', () => {
  const dates = [
    '8/11/2013',
    '09/11/2013',
    '10/11/2013',
    '16/11/2013',
    '12/11/2013',
    '17/11/2013',
    '08/12/2013',
    '08/12/2013',
    '08/12/2013',
    '08/12/2013',
    '06/01/2014',
    '06/01/2014',
    '07/01/2014',
    '08/01/2014',
    '08/01/2014',
    '12/04/2015',
    '12/04/2015',
    '22/09/2016',
    '15/09/2015',
    '21/09/2015',
  ];
  const records = dates.map(date => ({ transactionDate: parseDate(date) }));

  let test = [];
  afterAll(() => {
    const [currentDate, expectedDates] = test;
    const parsedCurrentDate = moment(currentDate, 'DD/MM/YYYY');
    const weekAgo = parsedCurrentDate.clone().subtract(7, 'days');
    const pastWeekRecords = getRecordsInDateRange(
      records,
      weekAgo.valueOf(),
      parsedCurrentDate.valueOf(),
    );
    const pastWeekDates = pastWeekRecords.map(record => moment(record.transactionDate).format('DD/MM/YYYY'));
    expect(pastWeekDates.sort()).toEqual(expectedDates.sort());
  });
  it('only returns records from the last week', () => {
    test = ['22/09/2015', ['21/09/2015', '15/09/2015']];
  });
  it('handles the current date being included in the records', () => {
    test = ['08/01/2014', ['08/01/2014', '08/01/2014', '06/01/2014', '06/01/2014', '07/01/2014']];
  });
  it('includes dates from exactly a week ago', () => {
    test = ['17/11/2013', ['10/11/2013', '12/11/2013', '16/11/2013', '17/11/2013']];
  });
  // TODO: Add tests for non-week ranges
});

async function fullLogicTest(testName, filename) {
  test(testName, async () => {
    /** @type {import('./ledger_output').LedgerOutput} */
    let output = null;
    /** @type {import('@/backend/reports').TaxPayerLedgerRecord[]} */
    let records = null;
    const csvPromises = [
      loadLedgerOutputCsv(`./${filename}_output.csv`).then((resolvedOutput) => { output = resolvedOutput; }),
      loadLedgerCsv(`./${filename}_ledger.csv`, false).then((resolvedRecords) => { records = resolvedRecords; }),
    ];
    await Promise.all(csvPromises);

    const promises = [];
    const taxTypeIds = Object.keys(output.data);
    if (taxTypeIds.length === 0) {
      throw new Error(`Example output file '${filename}' has no tax types`);
    }
    if (typeof output.currentWeekEnding !== 'number' || Number.isNaN(output.currentWeekEnding)) {
      throw new Error('Invalid or missing current week ending date');
    }
    // If no previous week ending was provided in the output, guess.
    if (typeof output.previousWeekEnding !== 'number' || Number.isNaN(output.previousWeekEnding)) {
      const currentWeekEnding = moment(output.currentWeekEnding);
      const previousWeekEnding = currentWeekEnding.clone().subtract(7, 'days');
      output.previousWeekEnding = previousWeekEnding.valueOf();
    }
    for (const taxTypeId of taxTypeIds) {
      // FIXME: Figure out how to indicate which tax type is being tested
      const ledgerTaxTypeOutput = output.data[taxTypeId];
      promises.push(taxPayerLedgerLogic({
        taxTypeId,
        previousPendingLiabilityTotals: ledgerTaxTypeOutput.previousWeekLiabilities,
        currentPendingLiabilityTotals: ledgerTaxTypeOutput.currentWeekLiabilities,
        taxPayerLedgerRecords: records,
        previousDate: output.previousWeekEnding,
        currentDate: output.currentWeekEnding,
        parentTaskId: null,
        client: null, // FIXME: Mock whatever the client data is needed for
      }).then((reasons) => {
        expect(reasons.changeReasonsByLiability).toEqual(ledgerTaxTypeOutput.changeReasons);
      }));
    }
    await Promise.all(promises);
  });
}

describe('full ledger logic tests', async () => {
  const logicTests = [
    'example1',
    'example2',
    'example3',
    'example4',
    'example5',
    'example7',
    'example9',
    'example10',
    'example11',
    'example12',
    'example13',
    'example14',
    'example15',
    'example16',
  ];
  for (const logicTest of logicTests) {
    fullLogicTest(logicTest, logicTest);
  }
});
