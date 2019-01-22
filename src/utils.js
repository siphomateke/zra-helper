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
