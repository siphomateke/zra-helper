// NOTE: devtools must be imported before vue
import devtools from '@vue/devtools'; // eslint-disable-line import/no-extraneous-dependencies
import Vue from 'vue';
import Buefy from 'buefy';
import DialogPlugin from '@/plugins/dialog';
import VueClipboard from 'vue-clipboard2';
import moment from 'moment';
import store from './store';
import initClientActions from './store/modules/client_actions/init';
import initClientsModule from './store/modules/clients/init';

if (process.env.NODE_ENV === 'development' && store.state.config.debug.devtools) {
  devtools.connect();
}

Vue.config.productionTip = false;

Vue.use(Buefy, {
  defaultIconPack: 'fas',
  defaultDateParser: date => moment(date, 'DD/MM/YYYY').toDate(),
  defaultDateFormatter: date => moment(date).format('DD/MM/YYYY'),
});

Vue.use(DialogPlugin);

Vue.use(VueClipboard);

initClientsModule();
initClientActions();
