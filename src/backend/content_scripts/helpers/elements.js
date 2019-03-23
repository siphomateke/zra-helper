import { ElementNotFoundError, ElementsNotFoundError } from '../../errors';
import getConfig from './config';

/**
 * Used when debugging to generate an HTML string from a Node (document or element).
 * @param {Node} node
 */
export function getHtmlFromNode(node) {
  const config = getConfig();
  if (config && config.debug.missingElementInfo) {
    if (node instanceof HTMLElement) {
      return node.innerHTML;
    } if (node instanceof Document) {
      return node.documentElement.innerHTML;
    }
  }
  return null;
}

/**
 * From an object of selectors, generates an object of elements with the same keys as the selectors
 * object using the passed document.
 *
 * If any of the elements are missing, an `ElementsNotFoundError` is thrown.
 * @param {Document|Element} document
 * @param {Object.<string, string>} selectors Object of selectors with names as keys.
 * @param {string} [customErrorMessage=null] Error message to show if any elements are missing.
 * If `$1` or `$2` appear in this string, they will be replaced with the
 * names of the missing elements and the missing elements' selectors respectively.
 * @returns {Object.<string, HTMLElement>} An object containing HTML elements with names as keys.
 * @throws {ElementsNotFoundError}
 */
export function getElementsFromDocument(document, selectors, customErrorMessage = null) {
  /** @type {string[]} Names of missing elements. */
  const missingElements = [];
  /** @type {string[]} Selectors of missing elements. */
  const missingSelectors = [];
  const els = {};
  for (const name of Object.keys(selectors)) {
    const selector = selectors[name];
    els[name] = document.querySelector(selector);
    if (!els[name]) {
      missingElements.push(name);
      missingSelectors.push(selector);
    }
  }
  if (missingElements.length > 0) {
    let errorMessage;
    if (customErrorMessage) {
      errorMessage = customErrorMessage;
    } else {
      errorMessage = 'Failed to find the following elements: $2.';
    }
    errorMessage = errorMessage.replace('$1', `[${missingElements.join(', ')}]`);
    errorMessage = errorMessage.replace('$2', `["${missingSelectors.join('", "')}"]`);
    throw new ElementsNotFoundError(errorMessage, null, {
      selectors: missingSelectors,
      html: getHtmlFromNode(document),
    });
  } else {
    return els;
  }
}

/**
 * Gets an element from a document using a selector and throws an `ElementNotFoundError` if it
 * doesn't exist.
 * @param {Document|Element} document
 * @param {string} selector
 * @param {string} name A descriptive name of the element. Used when generating errors.
 * @returns {HTMLElement}
 * @throws {ElementNotFoundError}
 */
export function getElementFromDocument(document, selector, name = null) {
  const element = document.querySelector(selector);
  if (!element) {
    if (name === null) name = selector;
    throw new ElementNotFoundError(`Element "${name}" not found.`, null, {
      selector,
      html: getHtmlFromNode(document),
    });
  } else {
    return element;
  }
}

/**
 * From an object of selectors, generates an object of elements with the same keys as the selectors
 * object.
 *
 * If any of the elements are missing, an `ElementsNotFoundError` is thrown.
 * @param {Object.<string, string>} selectors Object of selectors with names as keys.
 * @param {string} [customErrorMessage=null] Error message to show if any elements are missing.
 * If `$1` or `$2` appear in this string, they will be replaced with the
 * names of the missing elements and the missing elements' selectors respectively.
 * @returns {Object.<string, HTMLElement>} An object containing HTML elements with names as keys.
 * @throws {ElementsNotFoundError}
 */
export function getElements(selectors, customErrorMessage = null) {
  return getElementsFromDocument(document, selectors, customErrorMessage);
}


/**
 * Gets an element using a selector and throws an `ElementNotFoundError` if it doesn't exist.
 * @param {string} selector
 * @param {string} name A descriptive name of the element. Used when generating errors.
 * @returns {HTMLElement}
 * @throws {ElementNotFoundError}
 */
export function getElement(selector, name = null) {
  return getElementFromDocument(document, selector, name);
}

/**
 * Gets the text within an element. It first tries innerText and then textContent.
 * @param {Element} el
 * @returns {string}
 */
export function getElementText(el) {
  let text = el.innerText;
  if (!text) {
    text = el.textContent;
  }
  return text;
}
