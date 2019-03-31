import Vue from 'vue';
import { BrowserCode } from './backend/constants';

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

// FIXME: Fix typing
export function objectFlip<K, V>(obj: { [key in K]: V }): { [key in V]: K } {
  const ret = {};
  Object.keys(obj).forEach(key => {
    ret[obj[key]] = key;
  });
  return ret;
}

/**
 * Array.map for Objects
 * @param obj
 * @param callback
 */
export function mapObject<O, K extends keyof O, R>(
  obj: O,
  callback: (value: O[K], key: K, obj: O) => R
) {
  const result: { [key in K]: R } = {};
  for (const key of Object.keys(obj)) {
    result[key] = callback.call(obj, obj[key], key, obj);
  }
  return result;
}

/**
 * Converts a string to PascalCase.
 * @param string The string to convert
 */
export function toPascalCase(string: string) {
  return string[0].toUpperCase() + string.substring(1, string.length);
}

/**
 * Performs a deep copy of an object.
 */
export function deepClone(object: Object) {
  return JSON.parse(JSON.stringify(object));
}

/**
 * Recursively clones an object while preserving reactivity.
 */
export function deepReactiveClone<Obj1, Obj2>(toCopy: Obj1, copyTo: Obj2) {
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
 */
export function getCurrentBrowser(): BrowserCode {
  return process.env.BROWSER;
}

/**
 * Checks which properties are missing from an object.
 * @returns The missing properties.
 */
export function objectHasProperties<O, P extends keyof O>(obj: O, properties: P[]) {
  const missing: P[] = [];
  for (const property of properties) {
    if (!(property in obj)) {
      missing.push(property);
    }
  }
  return missing;
}

/**
 * Standard array join except a different character can be provided for the last separator.
 */
export function joinSpecialLast(arr: string[], separator: string, lastSeparator: string) {
  let output: string = '';
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
 */
export async function delay(timeout: number) {
  return new Promise(resolve => setTimeout(resolve, timeout));
}
