import Vue from 'vue';
import Vuex from 'vuex';
import global from './modules/global';
import tasks from './modules/tasks';

Vue.use(Vuex);

export const storeOptions = {
  modules: {
    global,
    tasks,
  },
  strict: true,
};
export default new Vuex.Store(storeOptions);
