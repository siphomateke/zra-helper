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

/**
 * Checks which properties are missing from an object.
 * @param {Object} obj
 * @param {string[]} properties
 * @return {string[]} The missing properties.
 */
export function objectHasProperties(obj, properties) {
  const missing = [];
  for (const property of properties) {
    if (!(property in obj)) {
      missing.push(property);
    }
  }
  return missing;
}

/**
 * Standard array join except a different character can be provided for the last separator.
 * @param {Array} arr
 * @param {string} separator
 * @param {string} lastSeparator
 * @returns {string}
 */
export function joinSpecialLast(arr, separator, lastSeparator) {
  let output = '';
  if (arr.length > 1) {
    output = `${arr.slice(0, -1).join(separator)}${lastSeparator}${arr.slice(-1)}`;
  } else if (arr.length > 0) {
    [output] = arr;
  } else {
    output = '';
  }
  return output;
}

/**
 * Async setTimeout
 * @param {number} timeout
 */
export async function delay(timeout) {
  return new Promise(resolve => setTimeout(resolve, timeout));
}
