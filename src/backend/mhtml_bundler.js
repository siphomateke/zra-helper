import mem from 'mem';
import axios from 'axios';
import moment from 'moment';
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
async function resolveStylesheetUrlFunctions(style, baseUrl, resourceFunc) {
  let stylesheet = style.innerHTML;
  const urlFunctions = stylesheet.match(/url\s*\(.+?\)/g);
  if (Array.isArray(urlFunctions)) {
    await Promise.all(urlFunctions.map(async (urlFunction) => {
      const [, resourceUrl] = urlFunction.match(/url\s*\(\s*'*"*\s*(.+?)\s*'*"*\s*\)/);
      const resolvedUrl = resolveUrl(resourceUrl, baseUrl);
      await resourceFunc(resolvedUrl);
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
async function processHtmlResources(elements, attribute, baseUrl, resourceFunc) {
  await Promise.all(Array.from(elements).map(async (element) => {
    const resourceUrl = element.getAttribute(attribute);
    const resolvedUrl = resolveUrl(resourceUrl, baseUrl);
    const dataUrl = await resourceFunc(resolvedUrl);
    element.setAttribute(attribute, dataUrl);
  }));
}

function generateMhtmlMultipart(boundary, type, encoding, location, data) {
  let str = [
    `--${boundary}`,
    `Content-Type: ${type}`,
    `Content-Transfer-Encoding: ${encoding}`,
    `Content-Location: ${location}`,
  ].join('\n');
  str += '\n\n';
  str += data;
  str += '\n';
  return str;
}

// TODO: Handle `@import` rules in stylesheets
class MhtmlGenerator {
  /**
   * @param {HTMLDocument} doc HTMLDocument to convert to a single HTML file.
   * @param {string} url Original url of the HTMLDocument.
   */
  constructor(doc, url) {
    this.doc = doc;
    this.baseUrl = url;
    this.resources = [];
    this.options = {
      mhtml: true,
    };
    this.serialized = '';
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
        if (!this.options.mhtml) {
          // Embed stylesheet in HTML
          const stylesheet = await makeRequest({ url: stylesheetUrl });
          const styleEl = this.doc.createElement('style');
          styleEl.innerHTML = stylesheet;
          this.doc.head.appendChild(styleEl);

          await this.resolveStylesheetUrlFunctions(styleEl, stylesheetUrl);
        } else {
          this.resources.push(stylesheetUrl);
        }

        // Remove original stylesheet link
        element.remove();
      } else if (!this.options.mhtml) {
        await this.resolveStylesheetUrlFunctions(element, this.baseUrl);
      }
    }));
  }

  async resolveStylesheetUrlFunctions(style, baseUrl) {
    return resolveStylesheetUrlFunctions(style, baseUrl, async (resolvedUrl) => {
      this.resources.push(resolvedUrl);
    });
  }

  processImages() {
    return processHtmlResources(this.doc.querySelectorAll('img[src]'), 'src', this.baseUrl, async (resolvedUrl) => {
      let newUrl;
      if (!this.options.mhtml) {
        newUrl = await getDataUrlFromResourceUrl(resolvedUrl);
      } else {
        newUrl = resolvedUrl;
        this.resources.push(resolvedUrl);
      }
      return newUrl;
    });
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

  async generateMhtml(boundary) {
    let mhtml = [
      'From: <Saved by ZRA Helper>',
      `Snapshot-Content-Location: ${this.baseUrl}`,
      `Subject: ${this.doc.title}`,
      `Date: ${moment().format('llll')}`,
      'MIME-Version: 1.0',
      'Content-Type: multipart/related;',
      '\ttype="text/html";',
      `\tboundary="${boundary}"`,
    ].join('\n');
    mhtml += '\n\n\n';
    // FIXME: Add content-id
    mhtml += generateMhtmlMultipart(boundary, 'text/html', 'quoted-printable', this.baseUrl, this.serialized);
    await Promise.all(this.resources.map(async (resource) => {
      try {
        const { data, headers } = await axios({
          url: resource,
          /* responseType: 'arrayBuffer', */
        });
        // console.log(headers, data);
        const contentType = headers['content-type'];
        // FIXME: Determine encoding
        const encoding = 'quoted-printable';
        mhtml += generateMhtmlMultipart(boundary, contentType, encoding, resource, data);
      } catch (error) {
        // Just don't add the resource if it's empty
        // TODO: Do something
      }
    }));
    return mhtml;
  }

  async getMhtmlBlob() {
    const serializer = new XMLSerializer();
    const serialized = serializer.serializeToString(this.doc);

    if (this.options.mhtml) {
      // TODO: Use proper boundary
      const boundary = '----MultipartBoundary--MeazXXggSUzl024v8TDvOloYQkXU3dGpV08r6lPQ7G----';
      this.serialized = await this.generateMhtml(boundary);
    }

    return new Blob([serialized], { type: 'text/html' });
  }

  async run() {
    this.removeScripts();
    await this.processStylesheets();
    await this.processImages();
    this.setCharacterEncoding();
    return this.getMhtmlBlob();
  }
}

export default function downloadMhtmlFile(doc, url) {
  const generator = new MhtmlGenerator(doc, url);
  return generator.run();
}
