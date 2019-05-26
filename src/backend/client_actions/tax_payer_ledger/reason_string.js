import moment from 'moment';
import { taxTypeNumericalCodes } from '@/backend/constants';
import { narrationTypes, narrationGroups } from './narration';
import { ledgerSystemErrors } from './logic';

const t = narrationTypes;

/**
 * Generates a string describing why pending liabilities changed.
 * @param {import('../return_history/base').TaxTypeNumericalCode} taxTypeId
 * @param {import('./logic').ChangeReasonDetails} detailsObj
 * @returns {string}
 */
export default function generateChangeReasonString(taxTypeId, detailsObj) {
  if ('change' in detailsObj && detailsObj.change === false) return 'NC'; // NC = No change

  const details = Object.assign({}, detailsObj);

  // For each detail with multiple possible values, combine the possible values into single strings.
  const detailsWithMultiplePossibleValues = ['prn', 'assessmentNumber'];
  for (const prop of detailsWithMultiplePossibleValues) {
    if (Array.isArray(details[prop])) {
      details[prop] = details[prop].join('|');
    }
  }

  const transactionDate = moment(details.transactionDate).format('DD/MM/YY');
  const fromDate = moment(details.fromDate);
  const toDate = moment(details.toDate);
  let periodString = fromDate.format('MM/YY');
  // FIXME: Add test for this
  // If period is the whole year
  if (fromDate.month() === 0 && toDate.month() === 11) {
    periodString = fromDate.format('YYYY');
  }
  const transactionString = `on ${transactionDate}`;

  const { narration } = details;
  const { type } = narration;

  const lines = [
    transactionString,
  ];

  if (type === t.ORIGINAL_RETURN) {
    if (details.systemErrors.includes(ledgerSystemErrors.RETURN_ROUNDED_UP)) {
      lines.unshift(...[
        'System error',
        `${periodString} Return`,
        'does not match',
        'ledger,',
        'ledger incorrect',
      ]);
    } else if (taxTypeId === taxTypeNumericalCodes.ITX) {
      lines.unshift(`${fromDate.format('YYYY')} Return`);
    } else {
      lines.unshift(`${periodString} Return`);
    }
  } else if (type === t.AMENDED_RETURN) {
    lines.unshift(`${periodString} Amended return`);
  } else if (
    type === t.PROVISIONAL_RETURN
    || type === t.REVISED_PROVISIONAL_RETURN
  ) {
    const { quarter } = narration.meta;
    let line = `${fromDate.format('YYYY')}Q${quarter} `;
    if (type === t.REVISED_PROVISIONAL_RETURN) {
      line += 'Revised provisional return';
    } else {
      line += 'Return';
    }
    lines.unshift(line);
  } else if ([
    t.PAYMENT,
    t.ADVANCE_PAYMENT,
    t.LATE_PAYMENT_INTEREST,
    t.LATE_PAYMENT_PENALTY,
    t.LATE_RETURN_PENALTY,
  ].includes(type)) {
    const paymentLines = [
      'Payment',
    ];
    if (details.prn) {
      paymentLines.push(`(PRN:${details.prn})`);
    }
    paymentLines.push(`of ${periodString}`);
    // FIXME: Handle advance payments
    if (type === t.PAYMENT) {
      // Leave the same if ordinary payment

      // FIXME: Confirm this works
      if (narration.meta.against === 'assessment manual penalty') {
        paymentLines.push(`(${details.assessmentNumber})`);
      }
    } else if (type === t.LATE_PAYMENT_INTEREST || type === t.LATE_PAYMENT_PENALTY) {
      paymentLines[0] = 'Late Payment';
      if (details.assessmentNumber) {
        paymentLines.push(...[
          'Assessment',
          `(${details.assessmentNumber})`,
        ]);
      }
      // FIXME: If there are multiple late returns or payments with the same details,
      // combine the names.
    } else if (type === t.LATE_RETURN_PENALTY) {
      paymentLines[0] = 'Late Return';
    }
    lines.unshift(...paymentLines);
    if (details.systemErrors.includes(ledgerSystemErrors.UNALLOCATED_ADVANCE_PAYMENT)) {
      lines.unshift('System error');
      lines.push(...[
        'not reflected',
        'reflected in ledger',
      ]);
    }
  } else if (
    narration.group === narrationGroups.ASSESSMENTS
    || type === t.AMENDED_ASSESSMENT_OBJECTION
  ) {
    lines.unshift(...[
      'Assessment',
      `(${details.assessmentNumber})`,
      `of ${periodString}`,
    ]);
    if (type === t.AMENDED_ASSESSMENT_OBJECTION) {
      lines.unshift('Amended');
    }
  } else if (type === t.PENALTY_FOR_AMENDED_ASSESSMENT) {
    lines.unshift(...[
      'Assessment refund',
      `(${details.assessmentNumber})`,
      `of ${periodString}`,
    ]);
  } else if (type === t.REFUND_OFFSET || type === t.REFUND_PAID) {
    lines.unshift(`of ${periodString}`);
    if (type === t.REFUND_OFFSET) {
      lines.unshift('Refund offset');
    } else if (type === t.REFUND_PAID) {
      lines.unshift('Refund paid');
    }
  } else if (
    type === t.BEING_POSTING_OPENING_BALANCE_MIGRATED
    || type === t.BEING_REVERSAL_DUPLICATE_PAYMENT
    || type === t.BEING_REVERSAL_REPLICATED_TRANSACTION
  ) {
    lines.unshift(periodString);
  }
  return lines.join('\n');
}
