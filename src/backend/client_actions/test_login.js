import { createClientAction, ClientActionRunner } from './base';

const TestLoginClientAction = createClientAction({
  id: 'testLogin',
  name: 'Test login',
});

TestLoginClientAction.runner = class extends ClientActionRunner {
  constructor() { super(TestLoginClientAction); }
};

export default TestLoginClientAction;
