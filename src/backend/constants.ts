import { objectFlip } from '@/utils';
import { TaxAccount } from './client_actions/utils';

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
  propErrors?: { [key: string]: ClientPropValidationError[] };
}

export interface ClientState {
  /** List of numerical tax type codes that this client has registered. */
  taxTypes: TaxTypeNumericalCode[];
  /** All the tax accounts this client has. */
  taxAccounts: TaxAccount[];
  /** Tax accounts whose status is 'registered'. */
  registeredTaxAccounts: TaxAccount[];
}

export type Client = ParsedClient & ClientState;
// #endregion

/** Date in the format 'DD/MM/YYYY' */
export type Date = string;
export type ReferenceNumber = string;

// #region Tax Types
/** Abbreviated tax type name. For example, 'ITX' (income tax) and 'WHT' (withholding tax). */
export type TaxTypeCode = string;
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

interface TaxTypeNumericalCode2 {
  ITX: '01';
  VAT: '02';
  PAYE: '03';
  TOT: '05';
  WHT: '06';
  PTT: '07';
  MINROY: '08';
  TLEVY: '09';
}

// FIXME: Decide between enum, interface or just something else that works.
export type TaxTypeCodeMap<T> = { [key in keyof TaxTypeNumericalCode2]?: T };
export type TaxTypeIdMap<T> = { [key in TaxTypeNumericalCode]?: T };

export const taxTypes = objectFlip(TaxTypeNumericalCode);

/** Human readable tax type name. For example, 'withholding tax' and 'medical levy tax'. */
export type TaxTypeName = string;

/**
 * Maps tax type names to their corresponding numerical codes.
 * This is primarily used when parsing payment history receipts.
 */
// FIXME: Fix this typing
export const taxTypeNames: { [key in TaxTypeName]: TaxTypeNumericalCode } = {
  'income tax': TaxTypeNumericalCode.ITX,
  'value added tax': TaxTypeNumericalCode.VAT,
  'employment tax (pay as you earn)': TaxTypeNumericalCode.PAYE,
  'turnover tax': TaxTypeNumericalCode.TOT,
  'withholding tax': TaxTypeNumericalCode.WHT,
  'property transfer tax': TaxTypeNumericalCode.PTT,
  'mineral royalty': TaxTypeNumericalCode.MINROY,
  'medical levy tax': TaxTypeNumericalCode.TLEVY,
};

/**
 * Tax type names found in the results of tax payer searches mapped to their corresponding
 * numerical codes.
 */
export const taxPayerSearchTaxTypeNames: { [key: string]: TaxTypeNumericalCode } = {
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

/** Tax account ID. E.g. 119608 or 405534 */
export type TaxAccountCode = string;
export type TaxAccountName = string;
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