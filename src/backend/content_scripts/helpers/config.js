import addContentScriptListener from './listener';

let config = null;

addContentScriptListener('receiveConfig', async (message) => {
  ({ config } = message);
});

export default function getConfig() {
  return config;
}
