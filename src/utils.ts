import Vue from 'vue';
import assignDeep from 'assign-deep';
import { BrowserCode } from './backend/constants';

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

// FIXME: Fix typing
export function objectFlip<O extends object, K extends keyof O, V extends O[K]>(
  obj: O,
): { [key in V]: K } {
  const ret = {};
  Object.keys(obj).forEach((key) => {
    ret[obj[key]] = key;
  });
  return ret;
}
/**
 * Array.map for Objects
 * @param obj
 * @param callback
 */
// FIXME: Fix typing
export function mapObject<O, K extends keyof O, R>(
  obj: O,
  callback: (value: O[K], key: K, obj: O) => R,
) {
  const result: { [key in K]: R } = {};
  for (const key of Object.keys(obj)) {
    result[key] = callback.call(obj, obj[key], key, obj);
  }
  return result;
}

mapObject({ pie: 2, beans: 'toast' }, () => {});

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
// FIXME: Decide whether this is the correct way to type this
export function deepClone<T>(object: T) {
  return JSON.parse(JSON.stringify(object));
}

/**
 * Recursively clones an object while preserving reactivity.
 */
export function deepReactiveClone<Obj1 extends object, Obj2 extends object>(
  toCopy: Obj1,
  copyTo: Obj2,
) {
  for (const key of Object.keys(toCopy)) {
    const value = toCopy[<keyof Obj1>key];
    // if the current value has more nested properties
    if (typeof value === 'object' && Object.keys(value).length > 0) {
      if (!(key in copyTo)) {
        Vue.set(copyTo, key, {});
      }
      deepReactiveClone(value, copyTo[<keyof Obj2>key]);
    } else {
      Vue.set(copyTo, key, value);
    }
  }
}

/**
 * Deeply assign the values of all enumerable properties from a source objects to a target object.
 * @returns The target object
 */
export function deepAssign<T, S>(target: T, source: S): T & S {
  return assignDeep(target, source);
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
export function joinSpecialLast(arr: string[], separator: string, lastSeparator: string): string {
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
export async function delay(timeout: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, timeout));
}