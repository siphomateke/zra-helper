import { narrationTypeValidators } from '../narration_validation';
import { narrationTypes } from '../narration';

test('narration metadata validators exist for all narration types', () => {
  expect(Object.keys(narrationTypes).sort()).toEqual(Object.keys(narrationTypeValidators).sort());
});
