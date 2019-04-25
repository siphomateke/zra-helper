import moment from 'moment';
import { getQuarterFromPeriod } from '../utils';

// TODO: Consider renaming 'narrations' to 'reason for change'

// #region Some example narrations:
/* eslint-disable max-len */
/*
TARPS Balance as of 31/10/2013
Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2013) from (Legacy Payment receipt no: 1234567)
Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2018)
Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2018) for Quarter {Q1}
Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2018) for Quarter {Q2}
Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2018) for Quarter {Q3}
Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2018) for Quarter {Q4}
Advance payment from  HENSON  Ref. PRN: 100000000000 (Payment Date: 01-JAN-2018) via. Reallocation
Closing Balance - 01/01/2018 to 31/12/2018
Closing Balance - 01/01/2018 to 31/12/2018
Late Payment Interest
Late Payment Penalty
Late Return Penalty
Late Payment Interest-Reversed
Late Payment Penalty-Reversed
Late Return Penalty-Reversed
Provisional Return (01/01/2018-31/03/2018)
Provisional Return (01/04/2018-30/06/2018)
Provisional Return (01/07/2018-30/09/2018)
Provisional Return (01/10/2018-31/12/2018)
Revised Provisional Return (01/01/2018-31/03/2018)
Original Return
Amended Return
Audit assessment from Audit Module (Assessment No : 10000000000000) (14 digits)
Additional assessment from Assessment Module (Assessment No : 10000000000000)
Additional assessment from Assessment Module (Assessment No : 10000000000000)(10000000000000)
Estimated Assessment (Assessment No : 00020316134466)
REVERSAL OF - Estimated Assessment (Assessment No : 00020316134471)
Fine for Audit assessment
Being penalty amounting to 0.00 imposed under section 100(1)(e)(i)(A) for Additional assessment for the Return Period 01/01/2018 to 31/01/2018
Amended assessment from Objection And Appeals Module (Assessment No : 10000000000000)
Penalty for Amended assessment
Refund Offset (PRN: 100000000000 ,Refund Period : 01-JAN-2018 to 31-JAN-2018 )
Refund Paid
Refund Paid.
Being posting of opening balance migrated from multiple account number-10000000/100.
Being reversal of a duplicated payment for the period December 2013 receipt number 1234567.
Being reversal of a transaction processed on Tax online, replicated on TARPS for the period December 2013.
Payment Reconciliation (PRN: 100000000000 ) against PRINCIPAL LIABILITY (Payment Date: 01-JAN-2018)
Payment Reconciliation (PRN: 100000000000 ) against PRINCIPAL LIABILITY (Payment Date: 01-JAN-2018) for Quarter {Q1}
Payment Reconciliation (PRN: 100000000000 ) against PRINCIPAL LIABILITY (Payment Date: 01-JAN-2018) for Quarter {Q2}
Payment Reconciliation (PRN: 100000000000 ) against PRINCIPAL LIABILITY (Payment Date: 01-JAN-2018) for Quarter {Q3}
Payment Reconciliation (PRN: 100000000000 ) against PRINCIPAL LIABILITY (Payment Date: 01-JAN-2018) for Quarter {Q4}
Payment Reconciliation (PRN: 100000000000 ) against PRINCIPAL LIABILITY (Payment Date: 01-JAN-2013) from (Legacy Payment receipt no: 1234567)
Payment Reconciliation (PRN: 100000000000 ) against PRINCIPAL LIABILITY (Payment Date: 01-JAN-2018) via. Reallocation
Payment Reconciliation (PRN: 100000000000 ) against INTEREST (Payment Date: 01-JAN-2018)
Payment Reconciliation (PRN: 100000000000 ) against INTEREST (Payment Date: 01-JAN-2013) from (Legacy Payment receipt no: 1234567)
Payment Reconciliation (PRN: 100000000000 ) against LATE RETURN PENALTY (Payment Date: 01-JAN-2018)
Payment Reconciliation (PRN: 100000000000 ) against LATE RETURN PENALTY (Payment Date: 01-JAN-2013) from (Legacy Payment receipt no: 1234567)
Payment Reconciliation (PRN: 100000000000 ) against PAYMENT PENALTY (Payment Date: 01-JAN-2018)
Payment Reconciliation (PRN: 100000000000 ) against PAYMENT PENALTY (Payment Date: 01-JAN-2013) from (Legacy Payment receipt no: 1234567)
Payment Reconciliation (PRN: 100000000000 ) against ASSESSMENT LIABILITY (Payment Date: 01-JAN-2018)
Payment Reconciliation (PRN: 100000000000 ) against ASSESSMENT MANUAL PENALTY (Payment Date: 01-JAN-2018)
REVERSAL OF - Payment Reconciliation (PRN: 100000000000 ) against PRINCIPAL LIABILITY (Payment Date: 01-JAN-2018)
*/
/* eslint-enable max-len */
// #endregion

/**
 * @typedef {string} NarrationType
 * @enum {NarrationType}
 */
const narrationTypes = {
  TARPS_BALANCE: 'TARPS_BALANCE',
  ADVANCE_PAYMENT: 'ADVANCE_PAYMENT',
  PAYMENT: 'PAYMENT',
  CLOSING_BALANCE: 'CLOSING_BALANCE',
  LATE_PAYMENT: 'LATE_PAYMENT',
  LATE_RETURN: 'LATE_RETURN',
  PROVISIONAL_RETURN: 'PROVISIONAL_RETURN',
  REVISED_PROVISIONAL_RETURN: 'REVISED_PROVISIONAL_RETURN',
  ORIGINAL_RETURN: 'ORIGINAL_RETURN',
  AMENDED_RETURN: 'AMENDED_RETURN',
  AUDIT_ASSESSMENT: 'AUDIT_ASSESSMENT',
  ADDITIONAL_ASSESSMENT: 'ADDITIONAL_ASSESSMENT',
  ESTIMATED_ASSESSMENT: 'ESTIMATED_ASSESSMENT',
  AUDIT_ASSESSMENT_PENALTY: 'AUDIT_ASSESSMENT_PENALTY',
  ADDITIONAL_ASSESSMENT_PENALTY: 'ADDITIONAL_ASSESSMENT_PENALTY',
  BEING_PENALTY_UNDER_ESTIMATION_PROVISIONAL_TAX: 'BEING_PENALTY_UNDER_ESTIMATION_PROVISIONAL_TAX',
  AMENDED_ASSESSMENT_OBJECTION: 'AMENDED_ASSESSMENT_OBJECTION',
  PENALTY_FOR_AMENDED_ASSESSMENT: 'PENALTY_FOR_AMENDED_ASSESSMENT',
  REFUND_OFFSET: 'REFUND_OFFSET',
  REFUND_PAID: 'REFUND_PAID',
  BEING_POSTING_OPENING_BALANCE_MIGRATED: 'BEING_POSTING_OPENING_BALANCE_MIGRATED',
  BEING_REVERSAL_DUPLICATE_PAYMENT: 'BEING_REVERSAL_DUPLICATE_PAYMENT',
  BEING_REVERSAL_REPLICATED_TRANSACTION: 'BEING_REVERSAL_REPLICATED_TRANSACTION',
};

/**
 * @typedef {Object} ParsedNarrationType
 * @property {NarrationType} type
 * @property {Object} meta
 * @property {boolean} reversal
 */

/**
 * @callback NarrationTypeMatcherTransformer
 * @param {ParsedNarrationType} parsed
 * @returns {ParsedNarrationType}
 */

/**
 * @typedef {Object} NarrationTypeMatcher
 * @property {RegExp} typeMatch Regular expressions to check if a narration is of this type.
 * @property {Object.<string, RegExp>} [meta]
 * Regular expressions that each match a single piece of metadata.
 * @property {NarrationTypeMatcherTransformer} [transformer]
 * Function that performs additional processing on the parsed data.
 */

// TODO: Parse dates using moment. All dates are in the DD/MM/YYYY format.
/* FIXME: Group the following:
- LATE_RETURN_PENALTY
- LATE_PAYMENT_PENALTY
- AUDIT_ASSESSMENT_PENALTY
- ADDITIONAL_ASSESSMENT_PENALTY
- UNDER_ESTIMATION_PROVISIONAL_TAX_PENALTY
*/
/** @type {Object.<string, NarrationTypeMatcher>} */
const narrationTypeMatchers = {
  [narrationTypes.TARPS_BALANCE]: {
    typeMatch: /^tarps balance/,
    meta: {
      date: /as of (.+)/,
    },
  },
  // TODO: Consider merging this with `PAYMENT`
  [narrationTypes.ADVANCE_PAYMENT]: {
    typeMatch: /^advance payment from/,
    meta: {
      advanceFrom: /advance payment from\s+(.+?)\s+ref/,
      refPrn: /ref\. prn: (\d+) \(/,
      paymentDate: /\(payment date: (.+?)\)/,
      fromReceiptNumber: /from \(legacy payment receipt no: (\d+)\)/,
      quarter: /for quarter {q(\d+)}/,
      via: /via\. (.+)/,
    },
  },
  [narrationTypes.PAYMENT]: {
    typeMatch: /^payment reconciliation/,
    meta: {
      prn: /\(prn: (\d+)\s*\)/,
      against: / against (.+?)\s*\(/,
      paymentDate: /\(payment date: (.+?)\)/,
      fromReceiptNumber: /from \(legacy payment receipt no: (\d+)\)/,
      quarter: /for quarter {q(\d+)}/,
      via: /via\. (.+)/,
    },
  },
  [narrationTypes.CLOSING_BALANCE]: {
    typeMatch: /^closing balance - /,
    meta: {
      fromDate: / - (.+) to /,
      toDate: / to (.+)/,
    },
  },
  [narrationTypes.LATE_PAYMENT]: {
    typeMatch: /^late payment [a-z]+/,
    meta: {
      type: /late payment ([a-z]+)/,
    },
  },
  [narrationTypes.LATE_RETURN]: {
    typeMatch: /^late return [a-z]+/,
    meta: {
      type: /late return ([a-z]+)/,
    },
  },
  [narrationTypes.PROVISIONAL_RETURN]: {
    typeMatch: /^provisional return/,
    meta: {
      fromDate: /\((.+)-.+\)/,
      toDate: /\(.+-(.+)\)/,
    },
    transformer(parsed) {
      // FIXME: Only parse date once. Moment shouldn't run in the transformer and again elsewhere.
      const periodFromMonth = moment(parsed.meta.fromDate, 'DD/MM/YYYY').format('MM');
      const periodToMonth = moment(parsed.meta.toDate, 'DD/MM/YYYY').format('MM');
      parsed.meta.quarter = getQuarterFromPeriod(periodFromMonth, periodToMonth);
    },
  },
  [narrationTypes.REVISED_PROVISIONAL_RETURN]: {
    typeMatch: /^revised provisional return/,
    meta: {
      fromDate: /\((.+)-.+\)/,
      toDate: /\(.+-(.+)\)/,
    },
  },
  [narrationTypes.ORIGINAL_RETURN]: {
    typeMatch: /^original return/,
  },
  [narrationTypes.AMENDED_RETURN]: {
    typeMatch: /^amended return/,
  },
  [narrationTypes.AUDIT_ASSESSMENT]: {
    typeMatch: /^audit assessment from audit module/,
    meta: {
      assessmentNumber: /\(assessment no : (\d+)\)/,
    },
  },
  [narrationTypes.ADDITIONAL_ASSESSMENT]: {
    typeMatch: /^additional assessment from assessment module/,
    meta: {
      assessmentNumber: /\(assessment no : (\d+)\)/,
    },
  },
  [narrationTypes.ESTIMATED_ASSESSMENT]: {
    typeMatch: /^estimated assessment/,
    meta: {
      assessmentNumber: /\(assessment no : (\d+)\)/,
    },
  },
  [narrationTypes.AUDIT_ASSESSMENT_PENALTY]: {
    typeMatch: /^fine for audit assessment/,
  },
  [narrationTypes.ADDITIONAL_ASSESSMENT_PENALTY]: {
    typeMatch: /^being penalty amounting.+for additional assessment/,
    meta: {
      amount: /being penalty amounting to (.+) imposed/,
      fromDate: /for the return period (.+) to/,
      toDate: /for the return period .+ to (.+)/,
    },
  },
  [narrationTypes.BEING_PENALTY_UNDER_ESTIMATION_PROVISIONAL_TAX]: {
    typeMatch: /^being penalty amounting.+under estimation for provisional tax/,
    meta: {
      amount: /being penalty amounting (.+) imposed/,
      fromDate: /for the return period (.+) -/,
      toDate: /for the return period .+ - (.+)/,
    },
  },
  [narrationTypes.AMENDED_ASSESSMENT_OBJECTION]: {
    typeMatch: /^amended assessment from objection and appeals module/,
    assessmentNumber: /\(assessment no : (\d+)\)/,
  },
  [narrationTypes.PENALTY_FOR_AMENDED_ASSESSMENT]: {
    typeMatch: /^penalty for amended assessment/,
  },
  [narrationTypes.REFUND_OFFSET]: {
    typeMatch: /^refund offset/,
    meta: {
      prn: /\(prn: (\d+)/,
      fromDate: /refund period : (.+) to/,
      toDate: /refund period : .+ to (.+)/,
    },
  },
  [narrationTypes.REFUND_PAID]: {
    typeMatch: /^refund paid/,
  },
  [narrationTypes.BEING_POSTING_OPENING_BALANCE_MIGRATED]: {
    typeMatch: /^being posting of opening balance migrated/,
    meta: {
      // TODO: Find out the proper names for these numbers
      num1: /account number-(\d+)\/\d+/,
      num2: /account number-\d+\/(\d+)/,
    },
  },
  [narrationTypes.BEING_REVERSAL_DUPLICATE_PAYMENT]: {
    typeMatch: /^being reversal of a duplicated payment/,
    meta: {
      period: /for the period (.+) receipt/,
      receiptNumber: /receipt number (\d+)/,
    },
  },
  [narrationTypes.BEING_REVERSAL_REPLICATED_TRANSACTION]: {
    typeMatch: /^being reversal of a transaction processed on tax online/,
    meta: {
      period: /for the period (.+?)\.*$/,
    },
  },
};

/**
 * Identifies the type of reason for change a narration in the tax payer ledger is. Additionally,
 * extracts information from the reason such as whether the reason is a reversal, dates,
 * receipt numbers and assessment numbers.
 * @param {string} narration Lower case narration.
 * @returns {ParsedNarrationType}
 */
// TODO: Add tests to this. It really needs them.
export default function parseNarration(narration) {
  let result = {
    type: null,
    meta: {},
    reversal: false,
  };
  result.reversal = narration.includes('reversal of') || narration.includes('reversed');
  for (const type of Object.keys(narrationTypeMatchers)) {
    const matcher = narrationTypeMatchers[type];
    if (narration.match(matcher.typeMatch)) {
      result.type = type;
      if (matcher.meta) {
        for (const metaMatcherName of Object.keys(matcher.meta)) {
          const metaMatcher = matcher.meta[metaMatcherName];
          const match = narration.match(metaMatcher);
          if (match) {
            [, result.meta[metaMatcherName]] = match;
          }
        }
      }
      if (matcher.transformer) {
        result = matcher.transformer(result);
      }
      break;
    }
  }
  return result;
}
