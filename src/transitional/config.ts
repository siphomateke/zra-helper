import store from '@/store';
import { ConfigState } from '@/store/modules/config';

const { config } = store.state;

const configHelper: ConfigState = new Proxy(
  {},
  {
    get(_obj, prop) {
      return config[prop];
    },
    set(_obj, prop, value) {
      store.commit('config/setProp', { prop, value });
      return true;
    },
  },
);
export default configHelper;
