// NOTE: devtools must be imported before vue
import devtools from '@vue/devtools'; // eslint-disable-line import/no-extraneous-dependencies
import Vue from 'vue';
import App from './App.vue';
import router from './router';

if (process.env.NODE_ENV === 'development') {
  devtools.connect();
}

Vue.config.productionTip = false;

new Vue({
  router,
  render: h => h(App),
}).$mount('#app');
