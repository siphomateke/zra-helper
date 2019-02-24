import store from '@/store';
import clientsModule from './index';

// TODO: Do this better, perhaps
export default function initClientActions() {
  // Register the client actions vuex module.
  // This is done here since it depends on files which just import the store.
  store.registerModule('clients', clientsModule);
}
