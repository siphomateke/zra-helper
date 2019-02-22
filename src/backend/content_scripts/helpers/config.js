let config = null;

function listener(message) {
  return new Promise((resolve) => {
    if (message.command === 'receiveConfig') {
      ({ config } = message);
      resolve({
        received: config,
      });
    }
  });
}
browser.runtime.onMessage.addListener(listener);

export default function getConfig() {
  return config;
}
