import Vue from 'vue';
import Vuex from 'vuex';
import global from './modules/global';
import tasks from './modules/tasks';
import log from './modules/log';

Vue.use(Vuex);

export const storeOptions = {
  modules: {
    global,
    tasks,
    log,
  },
  strict: true,
};
export default new Vuex.Store(storeOptions);
