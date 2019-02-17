import store from '@/store';

const { config } = store.state;

// TODO: Document me
const configHelper = new Proxy({}, {
  get(obj, prop) {
    return config[prop];
  },
  set(obj, prop, value) {
    store.commit('config/setProp', { prop, value });
    return true;
  },
});
export default configHelper;
