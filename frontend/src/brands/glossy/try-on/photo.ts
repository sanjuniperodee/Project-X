/** A photo picked on the device, ready to draw and to trace. Nothing leaves the browser. */
export interface PickedPhoto {
  /** Drawable copy, at most DISPLAY_SIDE px on the long side. */
  image: HTMLCanvasElement;
  /** Size of the original, px. */
  width: number;
  height: number;
  /** Small copy for the matting model, the size the layout service traces (its preview thumbnail). */
  preview: ImageData;
}

const DISPLAY_SIDE = 2400;
const PREVIEW_SIDE = 640;

export async function pickPhoto(file: Blob): Promise<PickedPhoto> {
  const source = await decode(file);
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!width || !height) throw new Error('Не получилось открыть фото');
  const image = scaled(source, width, height, DISPLAY_SIDE);
  const small = scaled(image, image.width, image.height, PREVIEW_SIDE);
  const preview = small.getContext('2d')!.getImageData(0, 0, small.width, small.height);
  if ('close' in source) source.close();
  return { image, width, height, preview };
}

/** Upright pixels: createImageBitmap applies the EXIF orientation; <img> is the fallback (HEIC in Safari). */
async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new Error('Этот формат фото не открывается. Попробуйте JPEG или PNG');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function scaled(source: CanvasImageSource, width: number, height: number, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}
