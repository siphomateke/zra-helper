import store from '@/store';
import initClientActions from './client_actions/init';
import clientsModule from './clients';
import exportsModule from './exports';

// These modules need to be initialized after the store is
export default function init() {
  store.registerModule('clients', clientsModule);
  store.registerModule('exports', exportsModule);
  initClientActions();
}
