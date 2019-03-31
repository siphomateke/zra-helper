declare module 'ocrad.js' {
  /**
   * Performs optical character recognition on an image.
   * @param canvas
   * @returns The recognized text.
   */
  function OCRAD(image: HTMLCanvasElement | CanvasRenderingContext2D | ImageData): string;
  export = OCRAD;
}
