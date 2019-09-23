import mem from 'mem';
import { makeRequest } from './utils';

/**
 * Resolves a relative URL given a base URL.
 */
function resolveUrl(url: string, baseUrl: string): string {
  return new URL(url, baseUrl).href;
}

/**
 * Converts a Blob to a data URL.
 */
function blobToDataUrl(blob: Blob): Promise<string> {
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
 * @returns Base64 data URL
 */
async function getDataUrlFromResourceUrlNoCache(resolvedUrl: string): Promise<string> {
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
    if (typeof error.response !== 'undefined' && error.response.status === 404) {
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
 */
// TODO: Improve performance
async function resolveStylesheetUrlFunctions(style: HTMLStyleElement, baseUrl: string) {
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
 * @param elements
 * Elements that have a URL attribute that should be converted to a data URL.
 * @param attribute Name of attribute to convert to data URL.
 */
async function processHtmlResources(
  elements: NodeListOf<HTMLElement>, attribute: string, baseUrl: string,
): Promise<any> {
  await Promise.all(Array.from(elements).map(async (element) => {
    const resourceUrl = element.getAttribute(attribute);
    const resolvedUrl = resolveUrl(resourceUrl, baseUrl);
    const dataUrl = await getDataUrlFromResourceUrl(resolvedUrl);
    element.setAttribute(attribute, dataUrl);
  }));
}

// TODO: Handle `@import` rules in stylesheets
class SingleHtmlFileGenerator {
  baseUrl: string;

  /**
   * @param doc HTMLDocument to convert to a single HTML file.
   * @param url Original url of the HTMLDocument.
   * @param title Optional string that will replace the page's title.
   */
  constructor(public doc: HTMLDocument, url: string, public title: string | null = null) {
    this.baseUrl = url;
  }

  removeScripts() {
    this.doc.querySelectorAll('script').forEach(element => element.remove());
  }

  async processStylesheets() {
    const styleRelatedElements: NodeListOf<HTMLStyleElement | HTMLLinkElement> = this.doc.querySelectorAll('style, link[rel*=stylesheet]');
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
    if (this.title) {
      this.doc.title = this.title;
    }
    return this.getHtmlBlob();
  }
}

/**
 * @param doc HTMLDocument to convert to a single HTML file.
 * @param url Original url of the HTMLDocument.
 * @param title Optional string that will replace the page's title.
 */
export default async function getSingleFileHtmlBlob(
  doc: HTMLDocument, url: string, title: string | null = null,
) {
  const generator = new SingleHtmlFileGenerator(doc, url, title);
  return generator.run();
}
