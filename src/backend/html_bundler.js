import mem from 'mem';
import { makeRequest } from './utils';

/**
 * Resolves a relative URL given a base URL.
 * @param {string} url
 * @param {string} baseUrl
 * @returns {string}
 */
function resolveUrl(url, baseUrl) {
  return new URL(url, baseUrl).href;
}

/**
 * Converts a Blob to a data URL.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.onabort = reject;
    reader.readAsDataURL(blob);
  });
}

const EMPTY_DATA_URL = 'data:base64,';

/**
 * Gets data URL from resolved resource URL.
 * @param {string} resolvedUrl
 * @returns {Promise.<string>} Base64 data URL
 */
async function getDataUrlFromResourceUrlNoCache(resolvedUrl) {
  let dataUrl;
  try {
    const response = await makeRequest({
      url: resolvedUrl,
      responseType: 'blob',
    });
    dataUrl = await blobToDataUrl(response);
  } catch (error) {
    // Since there are a lot of references to non-existent resources on the ZRA website,
    // we can just ignore missing resources.
    if (error.response.status === 404) {
      dataUrl = EMPTY_DATA_URL;
    } else {
      // If there was any other error, throw it as the generated HTML file will be incomplete
      // without the resource and thus invalid.
      throw error;
    }
  }
  return dataUrl;
}

/**
 * The returned data URLs are cached, even if they are empty.
 *
 * TODO: Implement smarter caching as described bellow.
 * The caching is sub-optimal as if a request for a certain resource is made before another
 * request for the same resource has finished, the second request will not use the result of the
 * first one. Ideally, the second resource would wait for the first one to complete and then check
 * the cache again.
 *
 * TODO: Consider caching even after extension reload, perhaps using localStorage.
 */
const getDataUrlFromResourceUrl = mem(getDataUrlFromResourceUrlNoCache, {
  maxAge: 1000 * 60 * 60 * 24, // 1 day
});

/**
 * Converts the URLs of all URL functions in a stylesheet to data URLs.
 * @param {HTMLStyleElement} style
 * @param {string} baseUrl
 */
// TODO: Improve performance
async function resolveStylesheetUrlFunctions(style, baseUrl) {
  let stylesheet = style.innerHTML;
  const urlFunctions = stylesheet.match(/url\s*\(.+?\)/g);
  if (Array.isArray(urlFunctions)) {
    await Promise.all(urlFunctions.map(async (urlFunction) => {
      const [, resourceUrl] = urlFunction.match(/url\s*\(\s*'*"*\s*(.+?)\s*'*"*\s*\)/);
      const resolvedUrl = resolveUrl(resourceUrl, baseUrl);
      const dataUrl = await getDataUrlFromResourceUrl(resolvedUrl);
      stylesheet = stylesheet.replace(urlFunction, `url('${dataUrl}')`);
    }));
  }
  style.innerHTML = stylesheet;
}

/**
 * Replaces the provided URL attribute of the provided elements with data URLs
 * @param {NodeListOf<HTMLElement>} elements
 * Elements that have a URL attribute that should be converted to a data URL.
 * @param {string} attribute Name of attribute to convert to data URL.
 * @param {string} baseUrl
 * @returns {Promise}
 */
async function processHtmlResources(elements, attribute, baseUrl) {
  await Promise.all(Array.from(elements).map(async (element) => {
    const resourceUrl = element.getAttribute(attribute);
    const resolvedUrl = resolveUrl(resourceUrl, baseUrl);
    const dataUrl = await getDataUrlFromResourceUrl(resolvedUrl);
    element.setAttribute(attribute, dataUrl);
  }));
}

// TODO: Handle `@import` rules in stylesheets
class SingleHtmlFileGenerator {
  /**
   * @param {HTMLDocument} doc HTMLDocument to convert to a single HTML file.
   * @param {string} url Original url of the HTMLDocument.
   */
  constructor(doc, url) {
    this.doc = doc;
    this.baseUrl = url;
  }

  removeScripts() {
    this.doc.querySelectorAll('script').forEach(element => element.remove());
  }

  async processStylesheets() {
    /** @type {NodeListOf<HTMLStyleElement|HTMLLinkElement>} */
    const styleRelatedElements = this.doc.querySelectorAll('style, link[rel*=stylesheet]');
    await Promise.all(Array.from(styleRelatedElements).map(async (element) => {
      if (element.tagName.toLowerCase() === 'link') {
        const stylesheetUrl = resolveUrl(element.getAttribute('href'), this.baseUrl);

        // Embed stylesheet in HTML
        const stylesheet = await makeRequest({ url: stylesheetUrl });
        const styleEl = this.doc.createElement('style');
        styleEl.innerHTML = stylesheet;
        this.doc.head.appendChild(styleEl);

        // Remove original stylesheet link
        element.remove();

        await resolveStylesheetUrlFunctions(styleEl, stylesheetUrl);
      } else {
        await resolveStylesheetUrlFunctions(element, this.baseUrl);
      }
    }));
  }

  processImages() {
    return processHtmlResources(this.doc.querySelectorAll('img[src]'), 'src', this.baseUrl);
  }

  /**
   * Replaces any charset `<meta>` tags with a 'utf-8' `<meta>` tag.
   *
   * This is required otherwise Â characters show up before al `&nbsp;`s in the generated HTML.
   */
  setCharacterEncoding() {
    // Remove existing charset meta tags
    this.doc.querySelectorAll('meta[charset], meta[http-equiv="content-type"]').forEach(element => element.remove());

    // Insert new utf-8 meta tag
    const metaEl = this.doc.createElement('meta');
    metaEl.setAttribute('charset', 'utf-8');
    if (this.doc.head.firstChild) {
      this.doc.head.insertBefore(metaEl, this.doc.head.firstChild);
    } else {
      this.doc.head.appendChild(metaEl);
    }
  }

  getHtmlBlob() {
    const serializer = new XMLSerializer();
    const serialized = serializer.serializeToString(this.doc);
    return new Blob([serialized], { type: 'text/html' });
  }

  async run() {
    this.removeScripts();
    await this.processStylesheets();
    await this.processImages();
    this.setCharacterEncoding();
    return this.getHtmlBlob();
  }
}

export default async function getSingleFileHtmlBlob(doc, url) {
  const generator = new SingleHtmlFileGenerator(doc, url);
  return generator.run();
}
