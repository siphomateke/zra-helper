import store from '@/store';

export function getScopedDispatch(scope) {
  return (name, payload) => store.dispatch(`${scope}/${name}`, payload, { root: true });
}
