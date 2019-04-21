import { checkLogin } from '@/backend/content_scripts/helpers/check_login';
import addContentScriptListener from '../helpers/listener';

addContentScriptListener('check_login', async message => checkLogin(document, message.client));
