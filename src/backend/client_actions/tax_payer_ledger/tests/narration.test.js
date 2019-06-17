import parseNarration, { narrationTypes, paymentAgainstTypes } from '../narration';
import { deepAssign, deepClone } from '@/utils';

/**
 * @typedef {import('../narration').ParsedNarrationType} ParsedNarrationType
 */

/**
 * Parses a narration and checks if the parsed output is the same as an expected one.
 * @param {string} narration
 * @param {Partial<ParsedNarrationType>} expected
 */
function parseExpectBasic(narration, expected) {
  const parsed = parseNarration(narration.toLowerCase());
  expect(parsed).toEqual(expect.objectContaining({ meta: {}, ...expected }));
}

/**
 * Parses a narration and checks if the parsed output is the same as the expected one.
 *
 * Also checks if the narration is still correctly parsed if it is a reversal. Note:
 * this is only done if a reversal wasn't strictly specified in `expected`.
 * @param {string} narration
 * @param {Partial<ParsedNarrationType>} expected
 */
function parseExpect(narration, expected) {
  if (!('reversal' in expected)) {
    parseExpectBasic(narration, { ...expected, reversal: false });
    parseExpectBasic(`REVERSAL OF - ${narration}`, { ...expected, reversal: true });
    parseExpectBasic(`${narration}-Reversed`, { ...expected, reversal: true });
  } else {
    parseExpectBasic(narration, expected);
  }
}

/**
 * Same as `parseExpect` but with a base expected obj whose properties can be optionally
 * overridden.
 * @see {@link parseExpect}
 * @param {string} narration
 * @param {Partial<ParsedNarrationType>} base
 * The base expected object whose properties will be overridden with those provided in `expected`.
 * @param {Partial<ParsedNarrationType>} expected
 * Object that extends `base`.
 */
function parseExpectBase(narration, base, expected = null) {
  if (expected !== null) {
    return parseExpect(narration, deepAssign(deepClone(base), expected));
  }
  return parseExpect(narration, base);
}

/**
 * @typedef {Object} NarrationParseTest
 * @property {string} name
 * @property {Partial<ParsedNarrationType>} [baseExpected]
 * Base expected parsed narration object to be used by all child tests.
 * @property {NarrationParseTest[]} [children]
 * @property {string} [narration]
 * @property {Partial<ParsedNarrationType>} [expected]
 * Expected parsed narration
 */

/**
 * Runs narration parsing tests.
 * @param {NarrationParseTest[]} parseTests
 * The tests to run
 * @param {Partial<ParsedNarrationType>} baseExpected
 * Base expected parsed narration object to be used by all child tests.
 */
function runNarrationParseTests(parseTests, baseExpected = null) {
  for (const parseTest of parseTests) {
    if (
      'children' in parseTest
      && Array.isArray(parseTest.children)
      && parseTest.children.length > 0
    ) {
      describe(parseTest.name, () => {
        runNarrationParseTests(parseTest.children, parseTest.baseExpected);
      });
    } else {
      test(parseTest.name, () => {
        if (baseExpected !== null) {
          parseExpectBase(
            parseTest.narration,
            baseExpected,
            parseTest.expected,
          );
        } else {
          parseExpect(
            parseTest.narration,
            parseTest.expected,
          );
        }
      });
    }
  }
}

const t = narrationTypes;

describe('narration parsing', () => {
  /** @type {NarrationParseTest[]} */
  const tests = [
    {
      name: 'tarps balance',
      narration: 'TARPS Balance as of 31/10/2013',
      expected: { type: t.TARPS_BALANCE, meta: { date: '31/10/2013' } },
    },
    {
      name: 'closing balance',
      narration: 'Closing Balance - 01/01/2018 to 31/12/2018',
      expected: { type: t.CLOSING_BALANCE, meta: { fromDate: '01/01/2018', toDate: '31/12/2018' } },
    },
    {
      name: 'late payment interest',
      baseExpected: { type: t.LATE_PAYMENT_INTEREST },
      children: [
        {
          name: 'basic',
          narration: 'Late Payment Interest',
        },
        {
          name: 'with assessment number',
          narration: 'Late Payment Interest(10000000000123)',
          expected: { meta: { assessmentNumber: '10000000000123' } },
        },
      ],
    },
    {
      name: 'late payment penalty',
      baseExpected: { type: t.LATE_PAYMENT_PENALTY },
      children: [
        {
          name: 'basic',
          narration: 'Late Payment Penalty',
        },
        {
          name: 'with assessment number',
          narration: 'Late Payment Penalty(10000000000123)',
          expected: { meta: { assessmentNumber: '10000000000123' } },
        },
      ],
    },
    {
      name: 'late return penalty',
      narration: 'Late Return Penalty',
      expected: { type: t.LATE_RETURN_PENALTY },
    },
    { name: 'original return', narration: 'Original Return', expected: { type: t.ORIGINAL_RETURN } },
    { name: 'supplementary return', narration: 'Supplementry Return', expected: { type: t.SUPPLEMENTARY_RETURN } },
    { name: 'amended return', narration: 'Amended Return', expected: { type: t.AMENDED_RETURN } },
    {
      name: 'audit assessment',
      narration: 'Audit assessment from Audit Module (Assessment No : 10000000000000)',
      expected: {
        type: t.AUDIT_ASSESSMENT,
        meta: {
          assessmentNumber: '10000000000000',
        },
      },
    },
    {
      name: 'additional assessment',
      baseExpected: {
        type: t.ADDITIONAL_ASSESSMENT,
        meta: {
          assessmentNumber: '10000000000000',
        },
      },
      children: [
        {
          name: 'basic',
          narration: 'Additional assessment from Assessment Module (Assessment No : 10000000000000)',
        },
        {
          name: 'with duplicate assessment number',
          narration: 'Additional assessment from Assessment Module (Assessment No : 10000000000000)(10000000000000)',
        },
      ],
    },
    {
      name: 'estimated assessment',
      narration: 'Estimated Assessment (Assessment No : 00020316134466)',
      expected: {
        type: t.ESTIMATED_ASSESSMENT,
        meta: { assessmentNumber: '00020316134466' },
      },
    },
    {
      name: 'audit assessment penalty',
      narration: 'Fine for Audit assessment',
      expected: { type: t.AUDIT_ASSESSMENT_PENALTY },
    },
    {
      name: 'additional assessment penalty',
      narration: 'Being penalty amounting to 0.00 imposed under section 100(1)(e)(i)(A) for Additional assessment for the Return Period 01/01/2018 to 31/01/2018',
      expected: {
        type: t.ADDITIONAL_ASSESSMENT_PENALTY,
        meta: {
          amount: '0.00',
          fromDate: '01/01/2018',
          toDate: '31/01/2018',
        },
      },
    },
    {
      name: 'being penalty under estimation provisional tax',
      narration: 'Being Penalty amounting 1000.00 imposed for under estimation for Provisional tax for the Return Period 01-JAN-18 - 31-DEC-18',
      expected: {
        type: t.BEING_PENALTY_UNDER_ESTIMATION_PROVISIONAL_TAX,
        meta: {
          amount: '1000.00',
          fromDate: '01-jan-18',
          toDate: '31-dec-18',
        },
      },
    },
    {
      name: 'amended assessment',
      narration: 'Amended assessment from Objection And Appeals Module (Assessment No : 10000000000000)',
      expected: {
        type: t.AMENDED_ASSESSMENT,
        meta: {
          assessmentNumber: '10000000000000',
        },
      },
    },
    {
      name: 'penalty for amended assessment',
      narration: 'Penalty for Amended assessment',
      expected: { type: t.PENALTY_FOR_AMENDED_ASSESSMENT },
    },
    {
      name: 'refund offset',
      narration: 'Refund Offset (PRN: 100000000000 ,Refund Period : 01-JAN-2018 to 31-JAN-2018 )',
      expected: {
        type: t.REFUND_OFFSET,
        meta: {
          prn: '100000000000',
          fromDate: '01-jan-2018',
          toDate: '31-jan-2018',
        },
      },
    },
    {
      name: 'refund paid',
      children: [
        {
          name: 'basic',
          narration: 'Refund Paid',
          expected: { type: t.REFUND_PAID },
        },
        {
          name: 'with period at the end',
          narration: 'Refund Paid.',
          expected: { type: t.REFUND_PAID },
        },
      ],
    },
    {
      name: 'opening balance',
      narration: 'Being posting of opening balance migrated from multiple account number-10000002/101.',
      expected: {
        type: t.BEING_POSTING_OPENING_BALANCE_MIGRATED,
        meta: {
          num1: '10000002',
          num2: '101',
        },
      },
    },
    {
      name: 'reversal of duplicate payment',
      narration: 'Being reversal of a duplicated payment for the period December 2013 receipt number 1234567.',
      expected: {
        type: t.BEING_REVERSAL_DUPLICATE_PAYMENT,
        meta: {
          period: 'december 2013',
          receiptNumber: '1234567',
        },
        reversal: true,
      },
    },
    {
      name: 'reversal of replicated transaction',
      narration: 'Being reversal of a transaction processed on Tax online, replicated on TARPS for the period December 2013.',
      expected: {
        type: t.BEING_REVERSAL_REPLICATED_TRANSACTION,
        meta: {
          period: 'december 2013',
        },
        reversal: true,
      },
    },
  ];

  runNarrationParseTests(tests);

  describe('advance payment', () => {
    /** @type {Partial<ParsedNarrationType>} */
    const baseParsed = {
      type: t.ADVANCE_PAYMENT,
      meta: {
        advanceFrom: 'henson',
        refPrn: '100000000000',
        paymentDate: '01-jan-2018',
      },
    };
    test('basic', () => parseExpectBase(
      'Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2018)',
      baseParsed,
    ));
    test('with legacy payment receipt number', () => parseExpectBase(
      'Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2018) from (Legacy Payment receipt no: 1234567)',
      baseParsed,
      { meta: { fromReceiptNumber: '1234567' } },
    ));
    test('all quarters', () => {
      for (let quarter = 1; quarter < 4 + 1; quarter++) {
        parseExpectBase(
          `Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2018) for Quarter {Q${quarter}}`,
          baseParsed,
          { meta: { quarter } },
        );
      }
    });
    test('via', () => {
      parseExpectBase(
        'Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2018) via. Reallocation',
        baseParsed,
        { meta: { via: 'reallocation' } },
      );
    });
  });

  describe('payment', () => {
    /** @type {Partial<ParsedNarrationType>} */
    const baseBaseParsed = {
      type: t.PAYMENT,
      meta: {
        prn: '100000000000',
        paymentDate: '01-jan-2018',
      },
    };
    for (const againstType of paymentAgainstTypes) {
      const baseParsed = deepClone(baseBaseParsed);
      baseParsed.meta.against = againstType;
      if (againstType === 'assessment liability' || againstType === 'assessment manual penalty') {
        baseParsed.meta.againstAssessment = true;
      }
      describe(againstType, () => {
        const againstTypeUppercase = againstType.toUpperCase();
        test('basic', () => parseExpectBase(
          `Payment Reconciliation (PRN: 100000000000 ) against ${againstTypeUppercase} (Payment Date: 01-JAN-2018)`,
          baseParsed,
        ));
        test('with legacy payment receipt number', () => parseExpectBase(
          `Payment Reconciliation (PRN: 100000000000 ) against ${againstTypeUppercase} (Payment Date: 01-JAN-2018) from (Legacy Payment receipt no: 1234567)`,
          baseParsed,
          { meta: { fromReceiptNumber: '1234567' } },
        ));
        if (againstType === 'principal liability') {
          test('all quarters', () => {
            for (let quarter = 1; quarter < 4 + 1; quarter++) {
              parseExpectBase(
                `Payment Reconciliation (PRN: 100000000000 ) against ${againstTypeUppercase} (Payment Date: 01-JAN-2018) for Quarter {Q${quarter}}`,
                baseParsed,
                { meta: { quarter } },
              );
            }
          });
          test('via', () => parseExpectBase(
            `Payment Reconciliation (PRN: 100000000000 ) against ${againstTypeUppercase} (Payment Date: 01-JAN-2018) via. Reallocation`,
            baseParsed,
            { meta: { via: 'reallocation' } },
          ));
        }
        if (againstType === 'assessment liability') {
          test('payment with assessment number', () => parseExpectBase(
            `Payment Reconciliation (PRN: 100000000000 ) against ${againstTypeUppercase} (Payment Date: 01-JAN-2018) (Assmt No : 10000000000123)`,
            baseParsed,
            {
              meta: {
                assessmentNumber: '10000000000123',
              },
            },
          ));
        }
      });
    }
  });

  describe('provisional return', () => {
    function testProvisionalReturnQuarters(type) {
      const quarterDates = [
        ['01/01/2018', '31/03/2018'],
        ['01/04/2018', '30/06/2018'],
        ['01/07/2018', '30/09/2018'],
        ['01/10/2018', '31/12/2018'],
      ];
      /** @type {Partial<ParsedNarrationType>} */
      const baseParsed = { type };
      for (let i = 0; i < quarterDates.length; i++) {
        const quarter = i + 1;
        const [fromDate, toDate] = quarterDates[i];
        let narration = `Provisional Return (${fromDate}-${toDate})`;
        if (type === t.REVISED_PROVISIONAL_RETURN) {
          narration = `Revised ${narration}`;
        }
        parseExpectBase(
          narration,
          baseParsed,
          { meta: { fromDate, toDate, quarter } },
        );
      }
    }
    test('all normal provisional return quarters', () => {
      testProvisionalReturnQuarters(t.PROVISIONAL_RETURN);
    });
    test('all revised provisional return quarters', () => {
      testProvisionalReturnQuarters(t.REVISED_PROVISIONAL_RETURN);
    });
  });
});
