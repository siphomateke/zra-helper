let config;

function listener(message) {
  return new Promise((resolve) => {
    if (message.command === 'receiveConfig') {
      config = message.config;
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
