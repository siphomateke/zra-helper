import Vue from 'vue';
import VeeValidate from 'vee-validate';
import dictionary from './dictionary';
import './rules';
import BuefyValidation from '@/plugins/buefy_validation';

Vue.use(VeeValidate, {
  mode: 'eager',
  errorBagName: '$errors',
  dictionary,
  inject: false,
});

Vue.use(BuefyValidation);
