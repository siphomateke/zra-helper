import moment from 'moment';
import { taxTypeNumericalCodes } from '@/backend/constants';
import { narrationTypes, narrationGroups } from './narration';
import { ledgerSystemErrors } from './logic';

const t = narrationTypes;

/**
 * Generates a string describing why pending liabilities changed.
 * @param {import('../return_history/base').TaxTypeNumericalCode} taxTypeId
 * @param {import('./logic').ChangeReasonDetails} details
 * @returns {string}
 */
export default function generateChangeReasonString(taxTypeId, details) {
  if (details === null || !details) return 'NC'; // NC = No change

  const transactionDate = moment(details.transactionDate).format('DD/MM/YY');
  const fromDate = moment(details.fromDate);
  const monthYear = fromDate.format('MM/YY');
  const transactionString = `on ${transactionDate}`;

  const { narration } = details;
  const { type } = narration;

  const lines = [
    transactionString,
  ];

  if (type === t.ORIGINAL_RETURN) {
    if (details.systemError === ledgerSystemErrors.RETURN_ROUNDED_UP) {
      lines.unshift(...[
        'System error',
        `${monthYear} Return`,
        'does not match',
        'ledger,',
        'ledger incorrect',
      ]);
    } else if (taxTypeId === taxTypeNumericalCodes.ITX) {
      lines.unshift(`${fromDate.format('YYYY')} Return`);
    } else {
      lines.unshift(`${monthYear} Return`);
    }
  } else if (type === t.AMENDED_RETURN) {
    lines.unshift(`${monthYear} Amended return`);
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
      `(PRN:${details.prn})`,
      `of ${monthYear}`,
    ];
    if (details.systemError === ledgerSystemErrors.ADVANCE_PAYMENT) {
      // FIXME: Handle actual advance payments
      paymentLines.unshift('System error');
      paymentLines.push(...[
        'not reflected',
        'reflected in ledger',
      ]);
    } else if (type === t.PAYMENT) {
      // Leave the same if ordinary payment

      // FIXME: Confirm this works
      if (narration.meta.against === 'assessment manual penalty') {
        paymentLines.push(`(${details.assessmentNumber})`);
      }
    } else if (type === t.LATE_PAYMENT_INTEREST || type === t.LATE_PAYMENT_PENALTY) {
      paymentLines[0] = 'Late payment';
      // FIXME: If there are multiple late returns or payments with the same details,
      // combine the names.
    } else if (type === t.LATE_RETURN_PENALTY) {
      paymentLines[0] = 'Late return';
    }
    lines.unshift(...paymentLines);
  } else if (
    narration.group === narrationGroups.ASSESSMENTS
    || type === t.AMENDED_ASSESSMENT_OBJECTION
  ) {
    lines.unshift(...[
      'Assessment',
      `(${details.assessmentNumber})`,
      `of ${monthYear}`,
    ]);
    if (type === t.AMENDED_ASSESSMENT_OBJECTION) {
      lines.unshift('Amended');
    }
  } else if (type === t.PENALTY_FOR_AMENDED_ASSESSMENT) {
    lines.unshift(...[
      'Assessment refund',
      `(${details.assessmentNumber})`,
      `of ${monthYear}`,
    ]);
  } else if (type === t.REFUND_OFFSET || type === t.REFUND_PAID) {
    if (type === t.REFUND_OFFSET) {
      lines.unshift('Refund offset');
    } else if (type === t.REFUND_PAID) {
      lines.unshift('Refund paid');
    }
    lines.unshift(`of ${monthYear}`);
  } else if (
    type === t.BEING_POSTING_OPENING_BALANCE_MIGRATED
    || type === t.BEING_REVERSAL_DUPLICATE_PAYMENT
    || type === t.BEING_REVERSAL_REPLICATED_TRANSACTION
  ) {
    lines.unshift(monthYear);
  }
  if (lines.length === 1) {
    console.log('LINES_LENGTH_1');
    console.log(details);
  }
  return lines.join('\n');
}
