import '@/vue_init';
import Vue from 'vue';
import Options from './Options.vue';
import store from '@/store';

new Vue({
  store,
  render: h => h(Options),
}).$mount('#app');
