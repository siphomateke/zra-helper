import addContentScriptListener from '@/backend/content_scripts/helpers/listener';
import { getElement } from '../helpers/elements';

addContentScriptListener(
  'inject_form',
  async (message) => {
    document.body.innerHTML = message.html;
    const submitFormButton = <HTMLFormElement>(
      getElement('#zra-helper-post-form', 'ZRA Helper submit POST form button')
    );
    submitFormButton.submit();
  },
  true,
);
