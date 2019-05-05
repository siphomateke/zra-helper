import { getElement } from '../helpers/elements';

try {
  const submitButton = <HTMLButtonElement>getElement('#submitButton', 'submit button');
  submitButton.type = 'submit';
} catch (error) {
  // Don't do anything if the submit button is missing.
}
