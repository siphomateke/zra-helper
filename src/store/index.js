import Vue from 'vue';
import Vuex from 'vuex';
import config from './modules/config';
import tasks from './modules/tasks';
import log from './modules/log';
import output from './modules/output';

Vue.use(Vuex);

/** @type {import('vuex').StoreOptions} */
export const storeOptions = {
  modules: {
    config,
    tasks,
    log,
    output,
  },
  strict: true,
};
export default new Vuex.Store(storeOptions);
