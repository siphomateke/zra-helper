/**
 * Checks if an image has loaded successfully.
 */
function imageHasLoaded(image: HTMLImageElement): boolean {
  return image.complete && image.naturalHeight !== 0;
}

export interface LoadedImagesResponse {
  /** Whether all images in the page loaded successfully. */
  allLoaded: boolean;
  /** URLs of all images in the page that failed to load. */
  unloadedImages: string[];
  /** Total number of images detected in the page. */
  imageCount: number;
}

/**
 * Finds images in an element or page and checks how many have loaded successfully.
 */
export default function findUnloadedImagesInPage(
  root: HTMLDocument | HTMLElement,
): LoadedImagesResponse {
  const images: NodeListOf<HTMLImageElement> = root.querySelectorAll('img[src]');
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
