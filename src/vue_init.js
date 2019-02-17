// NOTE: devtools must be imported before vue
import devtools from '@vue/devtools'; // eslint-disable-line import/no-extraneous-dependencies
import Vue from 'vue';
import Buefy from 'buefy';
import VueClipboard from 'vue-clipboard2';
import store from './store';
import initClientActions from './store/modules/client_actions/init';

if (process.env.NODE_ENV === 'development' && store.state.config.debug.devtools) {
  devtools.connect();
}

Vue.config.productionTip = false;

Vue.use(Buefy, {
  defaultIconPack: 'fas',
});

Vue.use(VueClipboard);

initClientActions();
