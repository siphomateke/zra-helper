import { createClientAction, ClientActionRunner, ClientActionObject } from '../base';
import '@/vue_init';
import store from '@/store';
import { getInstanceClassById } from '@/store/modules/client_actions';

/**
 * Creates a dummy client action for testing purposes.
 */
export function createTestClientAction() {
  const testAction = createClientAction({
    id: 'testAction',
    name: 'Test action',
    requiredFeatures: [],
  });
  testAction.Runner = class extends ClientActionRunner {
    constructor() {
      super(testAction);
    }
  };
  return testAction;
}

/**
 * Generates a dummy client action instance from a fake run.
 */
export function getFakeRunInstanceClassFromAction<I extends object, O>(
  action: ClientActionObject<I, O>,
): ClientActionRunner<I, O, any> {
  store.commit('clientActions/startNewRun', {
    taskId: 0,
    clients: [],
    allClients: [],
  });

  const instanceId = 0;
  store.commit('clientActions/addNewInstance', {
    instanceId,
    Runner: action.Runner,
    client: {},
    config: {},
  });
  return getInstanceClassById(instanceId);
}

/**
 * Tests a client action runner's output merging.
 * @param outputs The outputs to merge.
 * @param expected The expected merged output.
 */
export function testMergingAllRunOutputs<I extends object, O, C>(
  instanceClass: ClientActionRunner<I, O, C>,
  outputs: any[],
  expected: any,
) {
  instanceClass.storeProxy.allRunOutputs = outputs;
  instanceClass.mergeAllRunOutputs();
  expect(instanceClass.storeProxy.output).toEqual(expected);
}
