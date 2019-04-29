import Vue from 'vue';
import Router from 'vue-router';
import Dashboard from './views/Dashboard.vue';
import Login from './views/Login.vue';
import Settings from './views/Settings.vue';

Vue.use(Router);

export default new Router({
  base: process.env.BASE_URL,
  routes: [
    {
      path: '/',
      redirect: { name: 'dashboard' },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: Dashboard,
      meta: {
        title: 'Dashboard',
        icon: 'tachometer-alt',
      },
    },
    {
      path: '/login',
      name: 'login',
      component: Login,
      meta: {
        title: 'Login',
        icon: 'sign-in-alt',
      },
    },
    {
      path: '/settings',
      name: 'settings',
      component: Settings,
      meta: {
        title: 'Settings',
        icon: 'cog',
      },
    },
  ],
});
