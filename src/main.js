import Vue from 'vue';
import App from './Dashboard.vue';
import router from './router';
import store from './store';
import Buefy from 'buefy';

Vue.config.productionTip = false;

Vue.use(Buefy, {
  defaultIconPack: 'fas',
});

new Vue({
  router,
  store,
  render: h => h(App),
}).$mount('#app');
