// NOTE: devtools must be imported before vue
import devtools from '@vue/devtools'; // eslint-disable-line import/no-extraneous-dependencies
import Vue from 'vue';
import Buefy from 'buefy';
import App from './Dashboard.vue';
import router from './router';
import store from './store';

if (process.env.NODE_ENV === 'development') {
  devtools.connect();
}

Vue.config.productionTip = false;

Vue.use(Buefy, {
  defaultIconPack: 'fas',
});

new Vue({
  router,
  store,
  render: h => h(App),
}).$mount('#app');