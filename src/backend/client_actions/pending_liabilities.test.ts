import Action, { generateTotals, pendingLiabilityColumns } from './pending_liabilities';
import { getFakeRunInstanceClassFromAction, testMergingAllRunOutputs } from './tests/utils';

function generateDummyTotals() {
  return generateTotals(pendingLiabilityColumns, '0.00');
}

describe('GetAllPendingLiabilitiesClientAction', () => {
  let instanceClass;
  let totals;
  beforeAll(() => {
    instanceClass = getFakeRunInstanceClassFromAction(Action);
    totals = generateDummyTotals();
  });
  describe('correctly handles retrieval errors when merging outputs', () => {
    it('retrieval errors for tax types that have since been successfully retrieved are discarded', () => {
      testMergingAllRunOutputs(instanceClass,
        [
          {
            totals: { ITX: totals },
            retrievalErrors: { VAT: 'Unknown error', PAYE: 'Unknown error' },
          },
          {
            totals: { VAT: totals },
            retrievalErrors: { PAYE: 'Unknown error' },
          },
          {
            totals: { PAYE: totals },
            retrievalErrors: {},
          },
        ],
        {
          totals: {
            ITX: totals,
            VAT: totals,
            PAYE: totals,
          },
          retrievalErrors: {},
        });
    });
    it('retrieval errors of unresolved tax types are carried over', () => {
      testMergingAllRunOutputs(instanceClass,
        [
          {
            totals: { ITX: totals },
            retrievalErrors: { VAT: 'Unknown error', PAYE: 'Unknown error' },
          },
          {
            totals: { VAT: totals },
            retrievalErrors: { PAYE: 'Unknown error' },
          },
        ],
        {
          totals: {
            ITX: totals,
            VAT: totals,
          },
          retrievalErrors: { PAYE: 'Unknown error' },
        });
    });
  });
});
