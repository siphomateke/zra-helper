import addContentScriptListener from './listener';
import configStore from '@/transitional/config';
import { ConfigState } from '@/store/modules/config';

let config: ConfigState;

addContentScriptListener('receive_config', async (message) => {
  ({ config } = message);
});

export default function getConfig() {
  if (config !== null) {
    return config;
  }
  return configStore;
}
