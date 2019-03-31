import store from '@/store';

/* eslint-disable import/prefer-default-export */
export function getScopedDispatch(scope: string) {
  return (name: string, payload: any) =>
    store.dispatch(`${scope}/${name}`, payload, { root: true });
}
/* eslint-enable import/prefer-default-export */
