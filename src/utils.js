import Vue from 'vue';
import assignDeep from 'assign-deep';

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
 * Deeply assign the values of all enumerable properties from a source objects to a target object.
 * @template T, S
 * @param {T} target
 * @param {S} source
 * @returns {T & S} The target object
 */
export function deepAssign(target, source) {
  return assignDeep(target, source);
}

/**
 * Gets the browser code of the current browser.
 * @returns {import('./backend/constants').BrowserCode}
 */
export function getCurrentBrowser() {
  return process.env.BROWSER;
}

/**
 * Checks if the provided properties are missing from or exist in an object
 * @param {Object} obj
 * @param {string[]} properties
 * @returns {{missing: string[], existing: string[]}} The missing and existing properties.
 */
export function objectHasProperties(obj, properties) {
  const missing = [];
  const existing = [];
  for (const property of properties) {
    if (!(property in obj)) {
      missing.push(property);
    } else {
      existing.push(property);
    }
  }
  return { missing, existing };
}

/**
 * Makes sure the provided object's keys all exist in an array.
 * @param {Object} obj
 * @param {string[]} array
 */
export function validateObjectKeys(obj, array) {
  let valid = true;
  /** Any unknown extra keys the object has. */
  const unknown = [];
  /** Valid keys the object has. */
  const existing = [];
  if (typeof obj === 'object' && !Array.isArray(obj)) {
    for (const key of Object.keys(obj)) {
      if (!array.includes(key)) {
        unknown.push(key);
      } else {
        existing.push(key);
      }
    }
  } else {
    valid = false;
  }
  if (unknown.length > 0) {
    valid = false;
  }
  return { valid, unknown, existing };
}

/**
 * Checks if the provided items are missing from or exist in an array.
 * @template T
 * @param {T[]} arr
 * @param {T[]} items
 * @return {{missing: T[], existing: T[]}} The missing and existing items.
 */
export function arrayHasItems(arr, items) {
  const missing = [];
  const existing = [];
  for (const item of items) {
    if (arr.indexOf(item) > -1) {
      existing.push(item);
    } else {
      missing.push(item);
    }
  }
  return { missing, existing };
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

/**
 * Checks if two objects are equivalent. That is they have the same keys with the same values.
 * It doesn't check if the two objects share the same reference.
 * @param {Object} obj1
 * @param {Object} obj2
 * @returns {boolean}
 */
// TODO: Evaluate performance and consider using lodash.
export function objectsEqual(obj1, obj2) {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
}
