import { getScopedDispatch } from './utils';

const dispatch = getScopedDispatch('log');

// TODO: Document my functions
export default {
  setCategory(category: string) {
    dispatch('setCategory', category);
  },

  log(content: string, type: string | null = null) {
    dispatch('addLine', { content, type, category: '' });
  },

  showError(error: any, warning: boolean = false) {
    dispatch('addErrorLine', { error, warning });
  },
};
