import { getCurrentBrowser } from '@/utils';
import { browserCodes } from './constants';

const currentBrowser = getCurrentBrowser();

browser.browserAction.onClicked.addListener(() => {
  browser.tabs.create({ url: 'app.html' });
});

// #region Lite mode

/** Resource URLs that should never be blocked from loading when in lite mode. */
const blacklist = [
  // Required to generate login captcha
  'https://www.zra.org.zm/GenerateCaptchaServlet.do',

  // Required to get pending liabilities
  // TODO: Remove this when we can get pending liabilities without opening tabs.
  'https://www.zra.org.zm/pages/ReportsNew/script/ajaxrequest.js',
  'https://www.zra.org.zm/pages/ReportsNew/script/rprtParameterCustom.js',
  'https://www.zra.org.zm/pages/ReportsNew/script/common.js',
];

/** URLs of pages whose resources should not be blocked in lite mode. Only used in Firefox. */
const blacklistPages = [
  // Payment receipts
  'https://www.zra.org.zm/ePaymentController.htm?',
  // Acknowledgement of returns receipts
  'https://www.zra.org.zm/retHist.htm?',
];

function webRequestListener(details) {
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
  if (currentBrowser === browserCodes.FIREFOX) {
    for (const url of blacklistPages) {
      if (details.documentUrl.includes(url)) {
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
      urls: ['https://www.zra.org.zm/*'],
      types: [
        'image',
        'font',
        'media',
        'script',
        'stylesheet',
      ],
    },
    ['blocking'],
  );
}

function disableZraLiteMode() {
  browser.webRequest.onBeforeRequest.removeListener(webRequestListener);
}

browser.runtime.onMessage.addListener((message, sender) => new Promise((resolve) => {
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
}));

// #endregion