import Vue from 'vue';

/**
 * Array.map for Objects
 * @param {Object} obj
 * @param {Function} callback
 */
export function mapObject(obj, callback) {
  const result = {};
  for (const key of Object.keys(obj)) {
    result[key] = callback.call(obj, obj[key], key, obj);
  }
  return result;
}

/**
 * Converts a string to PascalCase.
 * @param {string} string The string to convert
 */
export function toPascalCase(string) {
  return string[0].toUpperCase() + string.substring(1, string.length);
}

/**
 * Performs a deep copy of an object.
 * @param {*} object
 */
export function deepClone(object) {
  return JSON.parse(JSON.stringify(object));
}

/**
 * Recursively clones an object while preserving reactivity.
 * @param {Object} toCopy
 * @param {Object} copyTo
 */
export function deepReactiveClone(toCopy, copyTo) {
  for (const key of Object.keys(toCopy)) {
    const value = toCopy[key];
    // if the current value has more nested properties
    if (typeof value === 'object' && Object.keys(value).length > 0) {
      if (!(key in copyTo)) {
        Vue.set(copyTo, key, {});
      }
      deepReactiveClone(value, copyTo[key]);
    } else {
      Vue.set(copyTo, key, value);
    }
  }
}

/**
 * Gets the browser code of the current browser.
 * @returns {import('./backend/constants').BrowserCode}
 */
export function getCurrentBrowser() {
  return process.env.BROWSER;
}
