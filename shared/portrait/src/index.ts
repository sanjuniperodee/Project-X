export { INPUT_SHORT_EDGE, inputSize, PORTRAIT_MODELS, toInputTensor, type MattingModel, type PortraitModelVariant } from './model';
export { traceSilhouette, type Silhouette } from './silhouette';
export { outlinePath, portraitCrop, type PortraitTarget, type Rect } from './crop';

import type { MattingModel } from './model';
import { toInputTensor } from './model';
import { traceSilhouette, type Silhouette } from './silhouette';

/** RGBA pixels of a photo (any size) → the person's silhouette, or null when there is no clear person. */
export async function findSilhouette(model: MattingModel, rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Promise<Silhouette | null> {
  const input = toInputTensor(rgba, width, height);
  const matte = await model.run(input.data, input.width, input.height);
  return traceSilhouette(matte, input.width, input.height);
}
