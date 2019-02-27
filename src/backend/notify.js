function getExtensionIcon() {
  const manifest = browser.runtime.getManifest();
  return browser.runtime.getURL(manifest.icons['48']);
}

/**
 * Creates a notification
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.icon]
 */
export default function notify(options) {
  const optionsCopy = Object.assign({
    icon: getExtensionIcon(),
  }, options);
  return browser.notifications.create({
    title: optionsCopy.title,
    message: optionsCopy.message,
    iconUrl: optionsCopy.icon,
    type: 'basic',
  });
}
