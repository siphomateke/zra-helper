import parseNarration, { narrationTypes } from '../narration';

const t = narrationTypes;

const samples = [
  'TARPS Balance as of 31/10/2013',
  'Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2013) from (Legacy Payment receipt no: 1234567)',
  'Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2018)',
  'Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2018) for Quarter {Q1}',
  'Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2018) for Quarter {Q2}',
  'Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2018) for Quarter {Q3}',
  'Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2018) for Quarter {Q4}',
  'Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2018) via. Reallocation',
  'Closing Balance - 01/01/2018 to 31/12/2018',
  'Closing Balance - 01/01/2018 to 31/12/2018',
  'Late Payment Interest',
  'Late Payment Interest(10000000000123)',
  'Late Payment Penalty',
  'Late Payment Penalty(10000000000123)',
  'Late Return Penalty',
  'Late Payment Interest-Reversed',
  'Late Payment Penalty-Reversed',
  'Late Return Penalty-Reversed',
  'Provisional Return (01/01/2018-31/03/2018)',
  'Provisional Return (01/04/2018-30/06/2018)',
  'Provisional Return (01/07/2018-30/09/2018)',
  'Provisional Return (01/10/2018-31/12/2018)',
  'Revised Provisional Return (01/01/2018-31/03/2018)',
  'Original Return',
  'Amended Return',
  'Audit assessment from Audit Module (Assessment No : 10000000000000) (14 digits)',
  'Additional assessment from Assessment Module (Assessment No : 10000000000000)',
  'Additional assessment from Assessment Module (Assessment No : 10000000000000)(10000000000000)',
  'Estimated Assessment (Assessment No : 00020316134466)',
  'REVERSAL OF - Estimated Assessment (Assessment No : 00020316134471)',
  'Fine for Audit assessment',
  'Being penalty amounting to 0.00 imposed under section 100(1)(e)(i)(A) for Additional assessment for the Return Period 01/01/2018 to 31/01/2018',
  'Amended assessment from Objection And Appeals Module (Assessment No : 10000000000000)',
  'Penalty for Amended assessment',
  'Refund Offset (PRN: 100000000000 ,Refund Period : 01-JAN-2018 to 31-JAN-2018 )',
  'Refund Paid',
  'Refund Paid.',
  'Being posting of opening balance migrated from multiple account number-10000000/100.',
  'Being reversal of a duplicated payment for the period December 2013 receipt number 1234567.',
  'Being reversal of a transaction processed on Tax online, replicated on TARPS for the period December 2013.',
  'Payment Reconciliation (PRN: 100000000000 ) against PRINCIPAL LIABILITY (Payment Date: 01-JAN-2018)',
  'Payment Reconciliation (PRN: 100000000000 ) against PRINCIPAL LIABILITY (Payment Date: 01-JAN-2018) for Quarter {Q1}',
  'Payment Reconciliation (PRN: 100000000000 ) against PRINCIPAL LIABILITY (Payment Date: 01-JAN-2018) for Quarter {Q2}',
  'Payment Reconciliation (PRN: 100000000000 ) against PRINCIPAL LIABILITY (Payment Date: 01-JAN-2018) for Quarter {Q3}',
  'Payment Reconciliation (PRN: 100000000000 ) against PRINCIPAL LIABILITY (Payment Date: 01-JAN-2018) for Quarter {Q4}',
  'Payment Reconciliation (PRN: 100000000000 ) against PRINCIPAL LIABILITY (Payment Date: 01-JAN-2013) from (Legacy Payment receipt no: 1234567)',
  'Payment Reconciliation (PRN: 100000000000 ) against PRINCIPAL LIABILITY (Payment Date: 01-JAN-2018) via. Reallocation',
  'Payment Reconciliation (PRN: 100000000000 ) against INTEREST (Payment Date: 01-JAN-2018)',
  'Payment Reconciliation (PRN: 100000000000 ) against INTEREST (Payment Date: 01-JAN-2013) from (Legacy Payment receipt no: 1234567)',
  'Payment Reconciliation (PRN: 100000000000 ) against LATE RETURN PENALTY (Payment Date: 01-JAN-2018)',
  'Payment Reconciliation (PRN: 100000000000 ) against LATE RETURN PENALTY (Payment Date: 01-JAN-2013) from (Legacy Payment receipt no: 1234567)',
  'Payment Reconciliation (PRN: 100000000000 ) against PAYMENT PENALTY (Payment Date: 01-JAN-2018)',
  'Payment Reconciliation (PRN: 100000000000 ) against PAYMENT PENALTY (Payment Date: 01-JAN-2013) from (Legacy Payment receipt no: 1234567)',
  'Payment Reconciliation (PRN: 100000000000 ) against ASSESSMENT LIABILITY (Payment Date: 01-JAN-2018)',
  'Payment Reconciliation (PRN: 100000000000 ) against ASSESSMENT MANUAL PENALTY (Payment Date: 01-JAN-2018)',
  'REVERSAL OF - Payment Reconciliation (PRN: 100000000000 ) against PRINCIPAL LIABILITY (Payment Date: 01-JAN-2018)',
];
// TODO: Add more reversed samples, preferably dynamically.
const sampleTypes = [
  t.TARPS_BALANCE,
  t.ADVANCE_PAYMENT,
  t.ADVANCE_PAYMENT,
  t.ADVANCE_PAYMENT,
  t.ADVANCE_PAYMENT,
  t.ADVANCE_PAYMENT,
  t.ADVANCE_PAYMENT,
  t.ADVANCE_PAYMENT,
  t.CLOSING_BALANCE,
  t.CLOSING_BALANCE,
  t.LATE_PAYMENT_INTEREST,
  t.LATE_PAYMENT_INTEREST,
  t.LATE_PAYMENT_PENALTY,
  t.LATE_PAYMENT_PENALTY,
  t.LATE_RETURN_PENALTY,
  t.LATE_PAYMENT_INTEREST,
  t.LATE_PAYMENT_PENALTY,
  t.LATE_RETURN_PENALTY,
  t.PROVISIONAL_RETURN,
  t.PROVISIONAL_RETURN,
  t.PROVISIONAL_RETURN,
  t.PROVISIONAL_RETURN,
  t.REVISED_PROVISIONAL_RETURN,
  t.ORIGINAL_RETURN,
  t.AMENDED_RETURN,
  t.AUDIT_ASSESSMENT,
  t.ADDITIONAL_ASSESSMENT,
  t.ADDITIONAL_ASSESSMENT,
  t.ESTIMATED_ASSESSMENT,
  t.ESTIMATED_ASSESSMENT,
  t.AUDIT_ASSESSMENT_PENALTY,
  t.ADDITIONAL_ASSESSMENT_PENALTY,
  t.AMENDED_ASSESSMENT_OBJECTION,
  t.PENALTY_FOR_AMENDED_ASSESSMENT,
  t.REFUND_OFFSET,
  t.REFUND_PAID,
  t.REFUND_PAID,
  t.BEING_POSTING_OPENING_BALANCE_MIGRATED,
  t.BEING_REVERSAL_DUPLICATE_PAYMENT,
  t.BEING_REVERSAL_REPLICATED_TRANSACTION,
  t.PAYMENT,
  t.PAYMENT,
  t.PAYMENT,
  t.PAYMENT,
  t.PAYMENT,
  t.PAYMENT,
  t.PAYMENT,
  t.PAYMENT,
  t.PAYMENT,
  t.PAYMENT,
  t.PAYMENT,
  t.PAYMENT,
  t.PAYMENT,
  t.PAYMENT,
  t.PAYMENT,
  t.PAYMENT,
];
const sampleReverseState = [
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  true,
  true,
  true,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  true,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  true,
  true,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  true,
];

const samplesByType = {};
for (let i = 0; i < sampleTypes.length; i++) {
  samplesByType[sampleTypes[i]] = samples[i];
}

function parse(narration) {
  return parseNarration(narration.toLowerCase());
}


describe('narration parsing', () => {
  const parsedNarrations = samples.map(sample => parse(sample.toLowerCase()));
  it('returns the correct narration type for all samples', () => {
    for (let i = 0; i < parsedNarrations.length; i++) {
      const narration = parsedNarrations[i];
      expect(narration.type).toBe(sampleTypes[i]);
    }
  });
  it('correctly recognizes whether a narration is reversed', () => {
    for (let i = 0; i < parsedNarrations.length; i++) {
      const narration = parsedNarrations[i];
      expect(narration.reversal).toBe(sampleReverseState[i]);
    }
  });
  // TODO: Add tests for late payment assessment number parsing
  describe('meta data extractor', () => {
    describe('advance payments', () => {
      /**
       * @typedef {Object} MetaDataTest
       * @property {string} name
       * @property {string} narration
       * @property {Object} expected
       */
      /** @type {MetaDataTest[]} */
      const tests = [
        {
          name: 'parses general advance payments',
          narration: 'Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 05-MAR-2015)',
          expected: {
            advanceFrom: 'henson',
            refPrn: '100000000000',
            paymentDate: '05-mar-2015',
          },
        },
        {
          name: 'parses quarters',
          narration: 'Advance payment from  DAVID  Ref. PRN: 100000000005 (Payment Date: 01-JAN-2018) for Quarter {Q1}',
          expected: {
            advanceFrom: 'david',
            refPrn: '100000000005',
            paymentDate: '01-jan-2018',
            quarter: '1',
          },
        },
        {
          name: 'parses what payments were via',
          narration: 'Advance payment from  BOB  Ref. PRN: 100000000002 (Payment Date: 12-DEC-2014) via. Reallocation',
          expected: {
            advanceFrom: 'bob',
            refPrn: '100000000002',
            paymentDate: '12-dec-2014',
            via: 'reallocation',
          },
        },
        {
          name: 'parses payments with legacy payment receipt numbers',
          narration: 'Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2013) from (Legacy Payment receipt no: 1234567)',
          expected: {
            advanceFrom: 'henson',
            refPrn: '100000000000',
            paymentDate: '01-jan-2013',
            fromReceiptNumber: '1234567',
          },
        },
      ];
      for (const test of tests) {
        it(test.name, () => {
          const { meta } = parse(test.narration);
          expect(meta).toEqual(test.expected);
        });
      }
    });
  });
});

// TODO: Add test for '- reversed'
