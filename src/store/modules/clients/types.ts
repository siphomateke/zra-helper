import { Client } from '@/backend/constants';

export interface ClientsState {
  all: { [key: string]: Client };
}
