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

  getInitialFailuresObj() {
    return {};
  }

  getRetryInput() {
    return {};
  }
};

export default TestLoginClientAction;
