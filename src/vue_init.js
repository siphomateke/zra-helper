// NOTE: devtools must be imported before vue
import devtools from '@vue/devtools'; // eslint-disable-line import/no-extraneous-dependencies
import Vue from 'vue';
import Buefy from 'buefy';
import DialogPlugin from '@/plugins/dialog';
import VueClipboard from 'vue-clipboard2';
import VueHighlightJS from 'vue-highlightjs';
import './validation';
import moment from 'moment';
import store from './store';
import initStoreModules from './store/modules/init';
import './store/modules/tasks_watch';

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
Vue.use(VueHighlightJS);

initStoreModules();
