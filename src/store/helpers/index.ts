import { mapGetters } from 'vuex';
import { mapObject } from '@/utils';

// FIXME: Type this
export function mapGettersById(...args) {
  const getters = mapGetters(...args);
  return mapObject(
    getters,
    getter => function mappedIdGetter() {
      return getter.call(this)(this.id);
    },
  );
}

type MapObj = { [key: string]: any };
/**
 * Normalize the map. Same as Vuex's normalizeMap.
 */
function normalizeMap<
  T extends(any[] | MapObj),
  K extends T extends any[] ? number : keyof T
>(map: T): { key: K, val: T[K] }[] {
  return Array.isArray(map)
    ? map.map(key => ({ key, val: key }))
    : Object.keys(map).map(key => ({ key, val: (<MapObj>map)[key] }));
}

// FIXME: Type this
export function mapProperties(obj, props) {
  const mapped = {};
  normalizeMap(props).forEach(({ key, val }) => {
    mapped[key] = function mappedProperty() {
      return this[obj][val];
    };
  });
  return mapped;
}
