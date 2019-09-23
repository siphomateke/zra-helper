import addContentScriptListener from '@/backend/content_scripts/helpers/listener';

addContentScriptListener(
  'inject_html',
  async (message) => {
    document.documentElement.innerHTML = message.html;
  },
  true,
);
