import { getPasswordExpiryDate } from '@/backend/content_scripts/helpers/check_login';
import addContentScriptListener from '../helpers/listener';

addContentScriptListener('get_password_expiry_date', async () => {
  const expiryDate = await getPasswordExpiryDate(document);
  return { expiryDate };
});
