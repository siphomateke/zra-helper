import { objectHasProperties } from '@/utils';

const clientProperties = ['id', 'name', 'username'];

export default function validateClient(value, properties = clientProperties) {
  const { missing } = objectHasProperties(value, properties);
  return missing.length === 0;
}

export function validateClients(value) {
  for (const client of value) {
    const valid = validateClient(client);
    if (!valid) return false;
  }
  return true;
}
