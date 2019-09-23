import { createClientAction, ClientActionRunner } from './base';

const TestLoginClientAction = createClientAction({
  id: 'testLogin',
  name: 'Test login',
});

TestLoginClientAction.Runner = class extends ClientActionRunner {
  failures: {} = {};

  constructor() {
    super(TestLoginClientAction);
  }

  // eslint-disable-next-line class-methods-use-this
  getInitialFailuresObj() {
    return {};
  }

  // eslint-disable-next-line class-methods-use-this
  getRetryInput() {
    return {};
  }
};

export default TestLoginClientAction;
