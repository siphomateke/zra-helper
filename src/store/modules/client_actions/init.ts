import store from '@/store';
import clientActionsModule from '@/store/modules/client_actions';
import GetAllPendingLiabilitiesClientAction from '@/backend/client_actions/pending_liabilities';
import GetReturnsClientAction from '@/backend/client_actions/return_history/returns';
import GetAcknowledgementsOfReturnsClientAction from '@/backend/client_actions/return_history/ack_receipt';
import CheckAccountApprovalStatusClientAction from '@/backend/client_actions/return_history/account_approval_status';
import GetPaymentReceiptsClientAction from '@/backend/client_actions/payment_history';
import TestLoginClientAction from '@/backend/client_actions/test_login';

const actions = [
  GetAllPendingLiabilitiesClientAction,
  GetReturnsClientAction,
  GetAcknowledgementsOfReturnsClientAction,
  CheckAccountApprovalStatusClientAction,
  GetPaymentReceiptsClientAction,
  TestLoginClientAction,
];

// TODO: Do this better, perhaps
export default function initClientActions() {
  // Register the client actions vuex module.
  // This is done here since it depends on files which just import the store.
  store.registerModule('clientActions', clientActionsModule);

  // Add all the client actions
  const promises = [];
  for (const action of actions) {
    promises.push(store.dispatch('clientActions/add', action));
  }
  return Promise.all(promises);
}
