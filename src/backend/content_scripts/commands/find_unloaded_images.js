import addContentScriptListener from '@/backend/content_scripts/helpers/listener';
import findUnloadedImagesInPage from '../helpers/images';

addContentScriptListener('find_unloaded_images', async () => findUnloadedImagesInPage(document), true);
