import addContentScriptListener from './listener';

let config = null;

async function listener(message) {
  ({ config } = message);
  return {
    received: config,
  };
}
addContentScriptListener('receiveConfig', listener);

export default function getConfig() {
  return config;
}
