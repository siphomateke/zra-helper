/**
 * Checks if an image has loaded successfully.
 * @param {HTMLImageElement} image
 * @returns {boolean}
 */
function imageHasLoaded(image) {
  return image.complete && image.naturalHeight !== 0;
}

/**
 * @typedef {Object} LoadedImagesResponse
 * @property {boolean} allLoaded Whether all images in the page loaded successfully.
 * @property {string[]} unloadedImages URLs of all images in the page that failed to load.
 * @property {number} imageCount Total number of images detected in the page.
 */

/**
 * Finds images in an element or page and checks how many have loaded successfully.
 * @param {Document|Element} root
 * @returns {LoadedImagesResponse}
 */
export default function findUnloadedImagesInPage(root) {
  /** @type {NodeListOf<HTMLImageElement>} */
  const images = root.querySelectorAll('img[src]');
  const unloadedImages = [];
  for (const image of images) {
    if (!imageHasLoaded(image)) {
      unloadedImages.push(image.src);
    }
  }
  return {
    allLoaded: unloadedImages.length === 0,
    unloadedImages,
    imageCount: images.length,
  };
}
