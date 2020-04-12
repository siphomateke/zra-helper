import { getCurrentBrowser } from '@/utils';
import { BrowserCode, ZraDomain, ZraCaptchaUrl } from './constants';

const currentBrowser = getCurrentBrowser();

browser.browserAction.onClicked.addListener(() => {
  browser.tabs.create({ url: 'app.html' });
});

// #region Lite mode

/** Resource URLs that should never be blocked from loading when in lite mode. */
const blacklist = [
  // Required to generate login captcha
  ZraCaptchaUrl,

  // Required to get pending liabilities
  // TODO: Remove this when we can get pending liabilities without opening tabs.
  `${ZraDomain}/pages/ReportsNew/script/ajaxrequest.js`,
  `${ZraDomain}/pages/ReportsNew/script/rprtParameterCustom.js`,
  `${ZraDomain}/pages/ReportsNew/script/common.js`,
];

/** URLs of pages whose resources should not be blocked in lite mode. Only used in Firefox. */
const blacklistPages = [
  // Payment receipts
  `${ZraDomain}/ePaymentController.htm?`,
  // Acknowledgement of returns receipts
  `${ZraDomain}/retHist.htm?`,
];

// FIXME: Remove this once the actual details can be extracted from @types/firefox-webext-browser
interface WebRequestOnBeforeRequestEventCallbackDetails {
  url: string;
  /** URL of the page into which the requested resource will be loaded. */
  documentUrl?: string;
}

function webRequestListener(details: WebRequestOnBeforeRequestEventCallbackDetails) {
  let cancel = true;
  for (const url of blacklist) {
    if (details.url.includes(url)) {
      cancel = false;
      break;
    }
  }

  // Firefox supports checking the URL of the document trying to load the resource.
  // We can use this to specifically allow loading all resources in pages that will be downloaded
  // such as payment receipts and acknowledgment of returns receipts.
  if (currentBrowser === BrowserCode.FIREFOX) {
    for (const url of blacklistPages) {
      if (details.documentUrl!.includes(url)) {
        cancel = false;
        break;
      }
    }
  }
  return { cancel };
}

/**
 * Blocks unnecessary resources from loading on the ZRA website.
 * This includes images, fonts, scripts and stylesheets.
 */
function enableZraLiteMode() {
  browser.webRequest.onBeforeRequest.addListener(
    webRequestListener,
    {
      urls: [`${ZraDomain}/*`],
      types: ['image', 'font', 'media', 'script', 'stylesheet'],
    },
    ['blocking'],
  );
}

function disableZraLiteMode() {
  browser.webRequest.onBeforeRequest.removeListener(webRequestListener);
}

browser.runtime.onMessage.addListener(
  (message, sender) => new Promise((resolve) => {
    if (sender.id === browser.runtime.id) {
      if (message.command === 'setZraLiteMode') {
        const enable = message.mode;
        if (enable) {
          enableZraLiteMode();
        } else {
          disableZraLiteMode();
        }
        resolve();
      }
    }
  }),
);

// #endregion
