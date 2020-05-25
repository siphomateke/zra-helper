import { ElementNotFoundError, ElementsNotFoundError } from '@/backend/errors';
import getConfig from './config';
import { objKeysExact } from '@/utils';

/**
 * Used when debugging to generate an HTML string from a Node (document or element).
 */
export function getHtmlFromNode(node: Node): string | null {
  const config = getConfig();
  if (config && config.debug.missingElementInfo) {
    if (node instanceof HTMLElement) {
      return node.innerHTML;
    }
    if (node instanceof HTMLDocument) {
      return node.documentElement.innerHTML;
    }
  }
  return null;
}

/** HTML Element selector. */
type Selector = string;

interface Selectors {
  [selectorId: string]: Selector;
}

export type RootElement = HTMLDocument | HTMLElement;

type ElementsFromSelectors<T extends Selectors> = { [key in keyof T]: HTMLElement | null };

/**
 * From an object of selectors, generates an object of elements with the same keys as the selectors
 * object using the passed document.
 *
 * If any of the elements are missing, an `ElementsNotFoundError` is thrown.
 * @param selectors Object of selectors with names as keys.
 * @param customErrorMessage Error message to show if any elements are missing.
 * If `$1` or `$2` appear in this string, they will be replaced with the
 * names of the missing elements and the missing elements' selectors respectively.
 * @returns An object containing HTML elements with names as keys.
 * @throws {ElementsNotFoundError}
 */
export function getElementsFromDocument<T extends Selectors>(
  document: RootElement,
  selectors: T,
  customErrorMessage: string = 'Failed to find the following elements: $2.',
): ElementsFromSelectors<T> {
  /** Names of missing elements. */
  const missingElements: string[] = [];
  /** Selectors of missing elements. */
  const missingSelectors: string[] = [];
  const els: ElementsFromSelectors<T> = {} as ElementsFromSelectors<T>;
  for (const name of objKeysExact(selectors)) {
    const selector = selectors[name];
    els[name] = document.querySelector<HTMLElement>(selector);
    if (!els[name]) {
      missingElements.push(name);
      missingSelectors.push(selector);
    }
  }
  if (missingElements.length > 0) {
    let errorMessage = customErrorMessage;
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
 * @param name A descriptive name of the element. Used when generating errors.
 * @throws {ElementNotFoundError}
 */
export function getElementFromDocument<T extends HTMLElement>(
  document: HTMLDocument | HTMLElement,
  selector: Selector,
  name?: string,
): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    if (!name) name = selector;
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
 * @param selectors Object of selectors with names as keys.
 * @param customErrorMessage Error message to show if any elements are missing.
 * If `$1` or `$2` appear in this string, they will be replaced with the
 * names of the missing elements and the missing elements' selectors respectively.
 * @returns An object containing HTML elements with names as keys.
 * @throws {ElementsNotFoundError}
 */
export function getElements(selectors: Selectors, customErrorMessage?: string) {
  return getElementsFromDocument(document, selectors, customErrorMessage);
}

/**
 * Gets an element using a selector and throws an `ElementNotFoundError` if it doesn't exist.
 * @param name A descriptive name of the element. Used when generating errors.
 * @throws {ElementNotFoundError}
 */
export function getElement(selector: Selector, name?: string): HTMLElement {
  return getElementFromDocument(document, selector, name);
}

/**
 * Gets the text within an element. It first tries innerText and then textContent.
 */
export function getElementText(el: HTMLElement): string | null {
  let text: string | null = el.innerText;
  if (!text) {
    text = el.textContent;
  }
  return text;
}
