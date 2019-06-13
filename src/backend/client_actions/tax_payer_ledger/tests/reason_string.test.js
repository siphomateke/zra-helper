import generateChangeReasonString from '../reason_string';
import { taxTypeNumericalCodes } from '@/backend/constants';
import { parseLedgerRecords, ledgerSystemErrors } from '../logic';
import { deepAssign } from '@/utils';

/**
 * @typedef {Partial<import('@/backend/reports').TaxPayerLedgerRecord>} RecordData
 * @typedef {Partial<import('../logic').ChangeReasonDetails>} ChangeReasonDetailsData
 */

/**
 *
 * @param {RecordData} recordData
 */
function createParsedRecord(recordData) {
  const [record] = parseLedgerRecords([{
    srNo: '113',
    transactionDate: '12/02/2013',
    fromDate: '01/01/2013',
    toDate: '31/01/2013',
    narration: 'Original Return',
    debit: '3000.96',
    credit: '0.00',
    cumulativeBalance: '',
    ...recordData,
  }]);
  return record;
}

/**
 *
 * @param {RecordData} recordData
 * @param {Partial<ChangeReasonDetailsData>} details
 */
function createDetails(recordData, details) {
  const record = createParsedRecord(recordData);
  return {
    change: true,
    fromDate: record.fromDate,
    toDate: record.toDate,
    transactionDate: record.transactionDate,
    narration: record.narration,
    systemErrors: [],
    ...details,
  };
}

/**
 * @typedef {Object} ReasonDetailsTest
 * @property {string} [name]
 * @property {RecordData} record
 * @property {ChangeReasonDetailsData} [details]
 * @property {import('@/backend/constants').TaxTypeNumericalCode} [taxTypeId]
 * @property {string[]} expected
 */

/**
 *
 * @param {ReasonDetailsTest} testOptions
 */
function createReasonDetailsTest(testOptions) {
  const testData = Object.assign({
    taxTypeId: taxTypeNumericalCodes.WHT,
  }, testOptions);
  return () => {
    const { narration } = testData.record;
    // Make sure the records being reversed doesn't affect the output
    const narrations = [narration, `REVERSAL OF - ${narration}`, `${narration}-Reversed`];
    for (const narration of narrations) {
      const details = createDetails({
        ...testData.record,
        narration,
      }, testData.details);
      const reason = generateChangeReasonString(testData.taxTypeId, details);
      expect(reason).toEqual(testData.expected.join('\n'));
    }
  };
}

function testProvisionalReturn(samples) {
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const sampleWithDefaults = deepAssign({
      record: {
        fromDate: '01/01/2015',
        toDate: '31/12/2015',
        transactionDate: '08/03/2015',
      },
    }, sample);
    test(`Q${i + 1}`, createReasonDetailsTest(sampleWithDefaults));
  }
}

// FIXME: Update tests now that we don't necessarily get PRNs and assessment numbers directly from
// narration
describe('change reason details string', () => {
  /** @type {ReasonDetailsTest[]} */
  const tests = [
    {
      name: 'original return',
      record: { narration: 'Original Return' },
      expected: [
        '01/13 Return',
        'on 12/02/13',
      ],
    },
    {
      name: 'income tax original return',
      taxTypeId: taxTypeNumericalCodes.ITX,
      record: {
        narration: 'Original Return',
        fromDate: '01/01/2012',
        toDate: '15/12/2012',
      },
      expected: [
        '2012 Return',
        'on 12/02/13',
      ],
    },
    {
      name: 'original return system error',
      record: { narration: 'Original Return' },
      details: { systemErrors: [ledgerSystemErrors.RETURN_ROUNDED_UP] },
      expected: [
        'System error',
        '01/13 Return',
        'does not match',
        'ledger,',
        'ledger incorrect',
        'on 12/02/13',
      ],
    },
    {
      name: 'amended return',
      record: { narration: 'Amended Return' },
      expected: [
        '01/13 Amended return',
        'on 12/02/13',
      ],
    },
    // TODO: Add more payment tests
    {
      name: 'payment',
      record: { narration: 'Payment Reconciliation (PRN: 100000000000 ) against PRINCIPAL LIABILITY (Payment Date: 01-JAN-2018) for Quarter {Q1}' },
      details: { prn: '100000000000' },
      expected: [
        'Payment',
        '(PRN:100000000000)',
        'of 01/13',
        'on 12/02/13',
      ],
    },
    {
      name: 'payment for whole year',
      record: {
        narration: 'Payment Reconciliation (PRN: 100000000001) against PRINCIPAL LIABILITY (Payment Date: 24-MAY-2016) via. Reallocation',
        fromDate: '05/01/2012',
        toDate: '09/12/2012',
      },
      details: { prn: '100000000001' },
      expected: [
        'Payment',
        '(PRN:100000000001)',
        'of 2012',
        'on 12/02/13',
      ],
    },
    {
      name: 'advance payment',
      record: { narration: 'Advance payment from  CLIENT  Ref. PRN: 100000000000 (Payment Date: 12-FEB-2013)' },
      details: { prn: '100000000000' },
      expected: [
        'Advance payment',
        '(PRN:100000000000)',
        'of 01/13',
        'on 12/02/13',
      ],
    },
    {
      name: 'advance payment error',
      record: { narration: 'Advance payment from  CLIENT  Ref. PRN: 100000000000 (Payment Date: 12-FEB-2013)' },
      details: {
        prn: '100000000000',
        systemErrors: [ledgerSystemErrors.UNALLOCATED_ADVANCE_PAYMENT],
      },
      expected: [
        'System error',
        'Advance payment',
        '(PRN:100000000000)',
        'of 01/13',
        'on 12/02/13',
        'not reflected',
        'reflected in ledger',
      ],
    },
    {
      name: 'late payment interest',
      record: { narration: 'Late Payment Interest' },
      details: { prn: '100000000025' },
      expected: [
        'Late Payment',
        '(PRN:100000000025)',
        'of 01/13',
        'on 12/02/13',
      ],
    },
    {
      name: 'late payment interest with assessment number in narration',
      record: { narration: 'Late Payment Interest(10000000000123)' },
      details: { prn: '100000000025', assessmentNumber: '10000000000123' },
      expected: [
        'Late Payment',
        '(PRN:100000000025)',
        'of 01/13',
        'Assessment',
        '(10000000000123)',
        'on 12/02/13',
      ],
    },
    {
      name: 'late payment penalty',
      record: { narration: 'Late Payment Penalty' },
      details: { prn: '100000000025' },
      expected: [
        'Late Payment',
        '(PRN:100000000025)',
        'of 01/13',
        'on 12/02/13',
      ],
    },
    {
      name: 'late payment penalty with assessment number in narration',
      record: { narration: 'Late Payment Penalty(10000000000123)' },
      details: { prn: '100000000025', assessmentNumber: '10000000000123' },
      expected: [
        'Late Payment',
        '(PRN:100000000025)',
        'of 01/13',
        'Assessment',
        '(10000000000123)',
        'on 12/02/13',
      ],
    },
    {
      name: 'late return penalty',
      record: { narration: 'Late Return Penalty' },
      details: { prn: '100000000025' },
      expected: [
        'Late Return',
        '(PRN:100000000025)',
        'of 01/13',
        'on 12/02/13',
      ],
    },
    {
      name: 'penalty for amended assessment',
      record: { narration: 'Penalty for Amended assessment' },
      details: { assessmentNumber: '100000000025' },
      expected: [
        'Assessment refund',
        '(100000000025)',
        'of 01/13',
        'on 12/02/13',
      ],
    },
    {
      name: 'refund offset',
      record: { narration: 'Refund Offset (PRN: 100000000000 ,Refund Period : 01-JAN-2018 to 31-JAN-2018 )' },
      expected: [
        'Refund offset',
        'of 01/13',
        'on 12/02/13',
      ],
    },
    {
      name: 'refund paid',
      record: { narration: 'Refund Paid' },
      expected: [
        'Refund paid',
        'of 01/13',
        'on 12/02/13',
      ],
    },
    {
      name: 'being posting opening balance migrated',
      record: { narration: 'Being posting of opening balance migrated from multiple account number-10000000/100.' },
      expected: [
        '01/13',
        'on 12/02/13',
      ],
    },
    {
      name: 'being reversal duplicate payment',
      record: { narration: 'Being reversal of a duplicated payment for the period December 2013 receipt number 1234567.' },
      expected: [
        '01/13',
        'on 12/02/13',
      ],
    },
    {
      name: 'being reversal replicated transaction',
      record: { narration: 'Being reversal of a transaction processed on Tax online, replicated on TARPS for the period December 2013.' },
      expected: [
        '01/13',
        'on 12/02/13',
      ],
    },
    {
      name: 'being penalty under estimation of provisional tax',
      record: {
        narration: 'Being Penalty amounting 522265.60 imposed for under estimation for Provisional tax for the Return Period 01-JAN-17 - 31-DEC-17',
        fromDate: '01/01/2017',
        toDate: '31/12/2017',
        transactionDate: '13/05/2018',
      },
      expected: [
        'Under estimation',
        'of 2017 prov tax',
        'on 13/05/18',
      ],
    },
  ];
  for (const testData of tests) {
    test(testData.name, createReasonDetailsTest(testData));
  }

  describe('provisional returns', () => {
    /** @type {Partial<ReasonDetailsTest>[]} */
    const provisionalReturnSamples = [{
      record: {
        narration: 'Provisional Return (01/01/2015-31/03/2015)',
        fromDate: '01/01/2015',
        toDate: '31/03/2015',
      },
      details: { quarter: '1' },
      expected: [
        '2015Q1 Return',
        'on 08/03/15',
      ],
    }, {
      record: {
        narration: 'Provisional Return (01/04/2015-30/06/2015)',
        fromDate: '01/04/2015',
        toDate: '30/06/2015',
      },
      details: { quarter: '2' },
      expected: [
        '2015Q2 Return',
        'on 08/03/15',
      ],
    }, {
      record: {
        narration: 'Provisional Return (01/07/2015-30/09/2015)',
        fromDate: '01/07/2015',
        toDate: '30/09/2015',
      },
      details: { quarter: '3' },
      expected: [
        '2015Q3 Return',
        'on 08/03/15',
      ],
    }, {
      record: {
        narration: 'Provisional Return (01/10/2015-31/12/2015)',
        fromDate: '01/10/2015',
        toDate: '31/12/2015',
      },
      details: { quarter: '4' },
      expected: [
        '2015Q4 Return',
        'on 08/03/15',
      ],
    }];
    describe('normal provisional returns', () => testProvisionalReturn(provisionalReturnSamples));
    const revisedProvisionalReturnSamples = [];
    for (const sample of provisionalReturnSamples) {
      sample.record.narration = `Revised ${sample.record.narration}`;
      sample.expected[0].replace(/Return/, 'Revised provisional return');
    }
    describe('revised provisional return', () => testProvisionalReturn(revisedProvisionalReturnSamples));
  });

  // TODO: Add test for amended assessment
  describe('assessments', () => {
    const assessmentTests = [
      ['audit assessment', 'Audit assessment from Audit Module (Assessment No : 10000000000123)'],
      ['additional assessment', 'Additional assessment from Assessment Module (Assessment No : 10000000000123)'],
      ['additional assessment variation 2', 'Additional assessment from Assessment Module (Assessment No : 10000000000123)(10000000000123)'],
      ['estimated assessment', 'Estimated Assessment (Assessment No : 10000000000123)'],
    ];
    for (const [testName, narration] of assessmentTests) {
      test(testName, createReasonDetailsTest({
        record: { narration },
        details: { assessmentNumber: '10000000000123' },
        expected: [
          'Assessment',
          '(10000000000123)',
          'of 01/13',
          'on 12/02/13',
        ],
      }));
    }
  });
});
