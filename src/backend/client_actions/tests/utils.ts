import { createClientAction, ClientActionRunner } from '../base';
import '@/vue_init';
import store from '@/store';
import { getInstanceClassById } from '@/store/modules/client_actions';

/**
 * @typedef {import('../base').ClientActionObject} ClientActionObject
 * @typedef {import('../base').ClientActionRunner} ClientActionRunner
 */

/**
 * Creates a dummy client action for testing purposes.
 * @returns {ClientActionObject}
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
 * @param {ClientActionObject} action
 * @returns {ClientActionRunner}
 */
export function getFakeRunInstanceClassFromAction(action) {
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
 * @param {ClientActionRunner} instanceClass
 * @param {any[]} outputs The outputs to merge.
 * @param {any} expected The expected merged output.
 */
export function testMergingAllRunOutputs(instanceClass, outputs, expected) {
  instanceClass.storeProxy.allRunOutputs = outputs;
  instanceClass.mergeAllRunOutputs();
  expect(instanceClass.storeProxy.output).toEqual(expected);
}
