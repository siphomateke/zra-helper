import Action, { generateTotals, totalsColumns, Totals, PendingLiabilitiesAction } from './pending_liabilities';
import { getFakeRunInstanceClassFromAction, testMergingAllRunOutputs } from './tests/utils';
import { ClientActionRunner } from './base';

function generateDummyTotals() {
  return generateTotals(totalsColumns, '0.00');
}

describe('GetAllPendingLiabilitiesClientAction', () => {
  let instanceClass: ClientActionRunner<
    PendingLiabilitiesAction.Input,
    PendingLiabilitiesAction.Output,
    PendingLiabilitiesAction.Config
  >;
  let totals: Totals;
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
