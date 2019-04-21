function getExtensionIcon(): string | null {
  const manifest = browser.runtime.getManifest();
  if (typeof manifest.icons !== 'undefined') {
    return browser.runtime.getURL(manifest.icons[48]);
  }
  return null;
}

interface NotifyOptions {
  title: string;
  message: string;
  icon?: string;
}

/**
 * Creates a notification
 */
export default function notify(options: NotifyOptions) {
  const optionsCopy = Object.assign({ icon: getExtensionIcon() }, options);
  return browser.notifications.create({
    title: optionsCopy.title,
    message: optionsCopy.message,
    iconUrl: optionsCopy.icon,
    type: 'basic',
  });
}
