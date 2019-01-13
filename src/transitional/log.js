import { getScopedDispatch } from './utils';

/** Log dispatch */
const logDispatch = getScopedDispatch('log');

export default {
  setCategory(category) {
    logDispatch('setCategory', category);
  },

  log(content, type) {
    logDispatch('addLine', { content, type, category: '' });
  },

  showError(error, warning = false) {
    logDispatch('addErrorLine', { error, warning });
  },
};
