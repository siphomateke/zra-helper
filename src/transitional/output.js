import { getScopedDispatch } from './utils';

const dispatch = getScopedDispatch('output');

export default {
  /**
   * Adds a new row to the output.
   * @param {string} row
   */
  addRow(row) {
    dispatch('addRow', row);
  },
};
