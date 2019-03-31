import addContentScriptListener from './listener';
import { ConfigState } from '@/store/modules/config';

let config: ConfigState;

addContentScriptListener('receive_config', async message => {
  ({ config } = message);
});

export default function getConfig() {
  return config;
}
