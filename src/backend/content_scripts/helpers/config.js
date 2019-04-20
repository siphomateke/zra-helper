import addContentScriptListener from './listener';
import configStore from '@/transitional/config';

let config = null;

addContentScriptListener('receive_config', async (message) => {
  ({ config } = message);
});

export default function getConfig() {
  if (config !== null) {
    return config;
  }
  return configStore;
}
