import { objectFlip } from '@/utils';
import { TaxAccount } from './client_actions/utils';

export const ZraDomain = 'https://portal.zra.org.zm';
export const ZraCaptchaUrl = `${ZraDomain}/captcha.jpg`;

// #region Browser
export enum BrowserCode {
  CHROME = 'chrome',
  FIREFOX = 'firefox',
}

/**
 * Human-readable names of browsers
 */
export const BrowserName: { [key in BrowserCode]: string } = {
  [BrowserCode.CHROME]: 'Chrome',
  [BrowserCode.FIREFOX]: 'Firefox',
};

export enum BrowserFeature {
  MHTML = 'saveAsMhtml',
}

export const featuresSupportedByBrowsers: { [key in BrowserCode]: BrowserFeature[] } = {
  [BrowserCode.CHROME]: [BrowserFeature.MHTML],
  [BrowserCode.FIREFOX]: [],
};
// #endregion

// #region Clients
export enum ClientPropValidationError {
  MISSING = 'MISSING',
  TPIN_SHORT = 'TPIN_SHORT',
  PASSWORD_SHORT = 'PASSWORD_SHORT',
}

/**
 * Human-readable versions of the client property validation error codes.
 */
export const clientPropValidationErrorMessages: { [key in ClientPropValidationError]: string } = {
  [ClientPropValidationError.MISSING]: 'Field must not be blank',
  [ClientPropValidationError.TPIN_SHORT]: 'TPIN (username) must be a 10 digit number',
  [ClientPropValidationError.PASSWORD_SHORT]: 'Password must be at least 8 characters long',
};

/** 10-digit username. */
export type TPIN = string;

export interface ParsedClient {
  id: number;
  name: string;
  username: TPIN;
  password: string;
  valid: boolean;
  /** An array of errors that will be set when the client is invalid */
  errors?: string[];
  /** List of validation errors per property */
  propErrors?: { [prop: string]: ClientPropValidationError[] };
}

export interface ClientState {
  /** List of numerical tax type codes that this client has registered. */
  taxTypes: TaxTypeNumericalCode[] | null;
  /** All the tax accounts this client has. */
  taxAccounts: TaxAccount[] | null;
  /** Tax accounts whose status is 'active'. */
  registeredTaxAccounts: TaxAccount[] | null;
}

export type Client = ParsedClient & ClientState;
// #endregion

/** Date in the format 'DD/MM/YYYY' */
export type DateString = string;
export type ReferenceNumber = string;

// #region Tax Types
/** Two-digit tax type code. For example, '01' (income tax) and '02' (value added tax). */
export enum TaxTypeNumericalCode {
  ITX = '01',
  VAT = '02',
  PAYE = '03',
  TOT = '05',
  WHT = '06',
  PTT = '07',
  MINROY = '08',
  TLEVY = '09',
}

interface ITaxTypeNumericalCode {
  ITX: '01';
  VAT: '02';
  PAYE: '03';
  TOT: '05';
  WHT: '06';
  PTT: '07';
  MINROY: '08';
  TLEVY: '09';
}

/** Abbreviated tax type name. For example, 'ITX' (income tax) and 'WHT' (withholding tax). */
export type TaxTypeCode = keyof ITaxTypeNumericalCode;

// FIXME: Decide between enum, interface or just something else that works.
export type TaxTypeCodeMap<T> = { [key in keyof ITaxTypeNumericalCode]?: T };
export type TaxTypeIdMap<T> = { [key in TaxTypeNumericalCode]?: T };

export const taxTypes = objectFlip(TaxTypeNumericalCode);
export const taxTypeNumericalCodes: TaxTypeNumericalCode[] = Object.values(TaxTypeNumericalCode);

/** Human readable tax type name. For example, 'withholding tax' and 'medical levy tax'. */
export type TaxTypeName = string;

/**
 * Maps tax type names to their corresponding numerical codes.
 * This is primarily used when parsing payment history receipts.
 */
export const taxTypeNamesMap: {
  readonly [taxTypeName: string]: TaxTypeNumericalCode
} = {
  'income tax': TaxTypeNumericalCode.ITX,
  'value added tax': TaxTypeNumericalCode.VAT,
  'employment tax (pay as you earn)': TaxTypeNumericalCode.PAYE,
  paye: TaxTypeNumericalCode.PAYE,
  'pay as you earn': TaxTypeNumericalCode.PAYE,
  'skills development levy': TaxTypeNumericalCode.PAYE,
  'turnover tax': TaxTypeNumericalCode.TOT,
  'withholding tax': TaxTypeNumericalCode.WHT,
  rents: TaxTypeNumericalCode.WHT,
  commissions: TaxTypeNumericalCode.WHT,
  'management or consultant fees': TaxTypeNumericalCode.WHT,
  'property transfer tax': TaxTypeNumericalCode.PTT,
  // Note that the space after "property transfer" is intentional
  'property transfer ': TaxTypeNumericalCode.PTT,
  'mineral royalty': TaxTypeNumericalCode.MINROY,
  'mineral royalty tax': TaxTypeNumericalCode.MINROY,
  // Note that "TLEVY" is "medical levy tax" everywhere else except payment history
  'tourism levy': TaxTypeNumericalCode.TLEVY,
};

/**
 * Tax type names found in the results of tax payer searches mapped to their corresponding
 * numerical codes.
 */
export const taxPayerSearchTaxTypeNamesMap: {
  readonly [taxTypeName: string]: TaxTypeNumericalCode
} = {
  'income tax': TaxTypeNumericalCode.ITX,
  vat: TaxTypeNumericalCode.VAT,
  paye: TaxTypeNumericalCode.PAYE,
  'turnover tax': TaxTypeNumericalCode.TOT,
  'withholding tax': TaxTypeNumericalCode.WHT,
  'property transfer tax': TaxTypeNumericalCode.PTT,
  ptt: TaxTypeNumericalCode.PTT,
  'mineral royalty': TaxTypeNumericalCode.MINROY,
  'medical levy tax': TaxTypeNumericalCode.TLEVY,
};

export const taxTypeHumanNames: {
  [taxTypeId in TaxTypeNumericalCode]: string;
} = {
  [TaxTypeNumericalCode.ITX]: 'Income Tax',
  [TaxTypeNumericalCode.VAT]: 'Value Added Tax',
  [TaxTypeNumericalCode.PAYE]: 'Employment Tax (Pay as You Earn)',
  [TaxTypeNumericalCode.TOT]: 'Turnover Tax',
  [TaxTypeNumericalCode.WHT]: 'Withholding Tax',
  [TaxTypeNumericalCode.PTT]: 'Property Transfer Tax',
  [TaxTypeNumericalCode.MINROY]: 'Mineral Royalty',
  [TaxTypeNumericalCode.TLEVY]: 'Medical Levy Tax',
};

/** Tax account ID. E.g. 119608 or 405534 */
export type TaxAccountCode = string;
export type TaxAccountName = string;
// #endregion

// #region Financial accounts
// FIXME: Update these codes
export enum FinancialAccountStatus {
  /** Fact of Filling Completed */
  RECD = 'RECD',
  /** Detail Data Entry Completed */
  DDED = 'DDED',
  /** Data Entry Verification Completed/Bypassed Sampling. */
  PRCD = 'PRCD',
  /** Assessment Initiated */
  ASMT = 'ASMT',
  /** Approval Completed */
  APPROVED = 'APPROVED',
  /** Incomplete return Notice issued at FOF, task pending for clarification */
  ACKNPEND = 'ACKNPEND',
  /** Return rejected by Acknowledgement Authority from pending clarification - ackn */
  RJCTACKN = 'RJCTACKN',
  /** Return Rejected by dde authority from pending clarification - dde */
  RJCTDDED = 'RJCTDDED',
  /** Return Rejected by approving authority from Acceptance of Amended return */
  RJCTAMND = 'RJCTAMND',
  /** Acceptance of amended return task subject to approval from approving authority */
  SBJTAPRV = 'SBJTAPRV',
  /** Pending for Document upload */
  PNDC = 'PNDC',
  /** Rejected */
  REJECTED = 'REJECTED',
  SUBMITTED = 'SUBMITTED',
}

const f = FinancialAccountStatus;

export const financialAccountStatusDescriptionsMap: { [key in FinancialAccountStatus]: string } = {
  [f.RECD]: 'Fact of Filling Completed',
  [f.DDED]: 'Detail Data Entry Completed',
  [f.PRCD]: 'Data Entry Verification Completed/Bypassed Sampling.',
  [f.ASMT]: 'Assessment Initiated',
  [f.APPROVED]: 'Approval Completed',
  [f.ACKNPEND]: 'Incomplete return Notice issued at FOF, task pending for clarification',
  [f.RJCTACKN]: 'Return rejected by Acknowledgement Authority from pending clarification - ackn',
  [f.RJCTDDED]: 'Return Rejected by dde authority from pending clarification - dde',
  [f.RJCTAMND]: 'Return Rejected by approving authority from Acceptance of Amended return',
  [f.SBJTAPRV]: 'Acceptance of amended return task subject to approval from approving authority',
  [f.PNDC]: 'Pending for Document upload',
  [f.REJECTED]: 'Rejected',
  [f.SUBMITTED]: 'Submitted',
};

export enum FinancialAccountStatusType {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  IN_PROGRESS = 'IN_PROGRESS',
}

export const financialAccountStatusTypeNames: { [key in FinancialAccountStatusType]: string } = {
  [FinancialAccountStatusType.APPROVED]: 'Approved',
  [FinancialAccountStatusType.REJECTED]: 'Rejected',
  [FinancialAccountStatusType.IN_PROGRESS]: 'In progress',
};

export const financialAccountStatusTypesMap: {
  [key in FinancialAccountStatusType]: FinancialAccountStatus[]
} = {
  [FinancialAccountStatusType.APPROVED]: [f.APPROVED],
  [FinancialAccountStatusType.REJECTED]: [
    f.RJCTACKN,
    f.RJCTAMND,
    f.RJCTDDED,
    f.REJECTED,
  ],
  [FinancialAccountStatusType.IN_PROGRESS]: [
    f.RECD,
    f.DDED,
    f.PRCD,
    f.ASMT,
    f.ACKNPEND,
    f.SBJTAPRV,
    f.PNDC,
  ],
  // FIXME: What type is SUBMITTED?
};
// #endregion

// #region Export
export enum ExportFormatCode {
  TXT = 'txt',
  CSV = 'csv',
  JSON = 'json',
}

interface ExportFormat {
  name: string;
  extension: string;
  mime: string;
}

export const exportFormats: { [key in ExportFormatCode]: ExportFormat } = {
  [ExportFormatCode.TXT]: {
    name: 'Text',
    extension: 'txt',
    mime: 'text/plain',
  },
  [ExportFormatCode.JSON]: {
    name: 'JSON',
    extension: 'json',
    mime: 'text/json',
  },
  [ExportFormatCode.CSV]: {
    name: 'CSV',
    extension: 'csv',
    mime: 'text/csv',
  },
};
// #endregion
