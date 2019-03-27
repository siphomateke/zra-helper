import { createClientAction, ClientActionRunner } from './base';

const TestLoginClientAction = createClientAction({
  id: 'testLogin',
  name: 'Test login',
});

TestLoginClientAction.Runner = class extends ClientActionRunner {
  constructor(data) {
    super(data, TestLoginClientAction);
  }
};

export default TestLoginClientAction;
