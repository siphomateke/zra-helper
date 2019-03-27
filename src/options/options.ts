import '@/vue_init';
import Vue from 'vue';
import store from '@/store';
import Options from './Options.vue';

new Vue({
  store,
  render: h => h(Options),
}).$mount('#app');
