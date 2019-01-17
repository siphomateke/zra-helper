import { getScopedDispatch } from './utils';

const dispatch = getScopedDispatch('log');

// TODO: Document my functions
export default {
  setCategory(category) {
    dispatch('setCategory', category);
  },

  log(content, type) {
    dispatch('addLine', { content, type, category: '' });
  },

  showError(error, warning = false) {
    dispatch('addErrorLine', { error, warning });
  },
};
