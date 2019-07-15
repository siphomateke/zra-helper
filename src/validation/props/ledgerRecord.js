import { objectHasProperties } from '@/utils';
import { ledgerColumns } from '@/backend/reports';

const recordProperties = ledgerColumns;

export default function validateRecord(value) {
  const { missing } = objectHasProperties(value, recordProperties);
  return missing.length === 0;
}

export function validateRecords(value) {
  for (const record of value) {
    const valid = validateRecord(record);
    if (!valid) return false;
  }
  return true;
}
