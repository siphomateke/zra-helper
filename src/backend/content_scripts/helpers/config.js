import addContentScriptListener from './listener';

let config = null;

addContentScriptListener('receive_config', async (message) => {
  ({ config } = message);
});

export default function getConfig() {
  return config;
}
