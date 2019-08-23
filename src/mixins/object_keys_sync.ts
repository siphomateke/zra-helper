import Vue, { ComponentOptions } from 'vue';

/**
 * Generates a mixin that syncs an object's keys with a provided property.
 * @param keyList Name of the array that contains all the keys.
 * @param objectList Name of the object whose keys need to be synced with the `keyList`.
 * @param defaultValue The default value to assign to items in the `objectList`.
 */
export default function generateObjectKeysSync(
  keyList: string,
  objectList: string,
  defaultValue: any,
): ComponentOptions<Vue> {
  return {
    watch: {
      [keyList](keys) {
        const objectListKeys = Object.keys(this[objectList]);
        // Remove items that no longer exist in the master keys list
        for (const key of objectListKeys) {
          if (!keys.includes(key)) {
            this.$delete(this[objectList], key);
          }
        }
        // Add any new items from the master keys list
        for (const key of keys) {
          if (!objectListKeys.includes(key)) {
            this.$set(this[objectList], key, defaultValue);
          }
        }
      },
    },
  };
}
