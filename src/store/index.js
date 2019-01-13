import Vue from 'vue';
import Vuex from 'vuex';
import config from './modules/config';
import tasks from './modules/tasks';
import log from './modules/log';
import browser from './modules/browser';

Vue.use(Vuex);

export const storeOptions = {
  modules: {
    config,
    tasks,
    log,
    browser,
  },
  strict: true,
};
export default new Vuex.Store(storeOptions);
