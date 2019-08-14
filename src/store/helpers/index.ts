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

/**
 * Normalize the map. Same as Vuex's normalizeMap.
 */
function normalizeMap(map: Array<any> | object) {
  return Array.isArray(map)
    ? map.map(key => ({ key, val: key }))
    : Object.keys(map).map(key => ({ key, val: map[key] }));
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
