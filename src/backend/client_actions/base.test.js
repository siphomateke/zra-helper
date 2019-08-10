import { createTestClientAction, getFakeRunInstanceClassFromAction, testMergingAllRunOutputs } from './tests/utils';

describe('ClientActionRunner', () => {
  const testAction = createTestClientAction();
  /** @type {import('./base').ClientActionRunner} */
  let instanceClass;
  beforeAll(() => {
    instanceClass = getFakeRunInstanceClassFromAction(testAction);
  });
  describe('mergeAllRunOutputs', () => {
    it('merges the outputs', () => {
      testMergingAllRunOutputs(instanceClass,
        [
          {
            totals: {
              ITX: {
                principal: 0,
              },
            },
          },
          {
            totals: {
              ITX: {
                total: 12,
              },
              VAT: {
                principal: 3,
              },
            },
          },
        ],
        {
          totals: {
            ITX: {
              principal: 0,
              total: 12,
            },
            VAT: {
              principal: 3,
            },
          },
        });
    });
    it('concatenates array items', () => {
      testMergingAllRunOutputs(instanceClass,
        [
          { pages: [1, 2, 3] },
          { pages: [4, 5, 6] },
        ],
        { pages: [1, 2, 3, 4, 5, 6] });
    });
    it('ignores null outputs', () => {
      testMergingAllRunOutputs(instanceClass,
        [
          { date: '01/01/2013' },
          null,
          null,
          { approved: false },
        ],
        {
          date: '01/01/2013',
          approved: false,
        });
    });
  });
});
