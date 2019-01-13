import store from '@/store';

/** Root dispatch */
export const rd = (name, payload) => store.dispatch(name, payload, { root: true });

export function getScopedDispatch(scope) {
  return (name, payload) => rd(`${scope}/${name}`, payload);
}

/** Browser dispatch */
export const bd = getScopedDispatch('browser');

export function createTab(url, active = false) {
  return bd('createTab', { url, active });
}

export async function createTabPost({ url, data, active = false }) {
  return bd('createTabPost', { url, data, active });
}

export function saveAsMHTML(options) {
  return bd('saveAsMHTML', options);
}

export async function executeScript(tabId, details, vendor = false) {
  return bd('executeScript', { tabId, details, vendor });
}

export function tabLoaded(desiredTabId, timeout = null) {
  return bd('tabLoaded', { desiredTabId, timeout });
}

export async function getActiveTab() {
  return bd('getActiveTab');
}

export function waitForMessage(validator) {
  return bd('waitForMessage', { validator });
}

export async function sendMessage(tabId, message) {
  return bd('sendMessage', { tabId, message });
}

export async function clickElement(tabId, selector, name = null, ignoreZraErrors = false) {
  return bd('clickElement', {
    tabId, selector, name, ignoreZraErrors,
  });
}

export function waitForDownloadToComplete(id) {
  return bd('waitForDownloadToComplete', { id });
}

export async function getDocumentByAjax({ url, method = 'get', data = {} }) {
  return bd('getDocumentByAjax', { url, method, data });
}

