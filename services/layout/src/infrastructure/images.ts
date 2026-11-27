import jpeg from 'jpeg-js';
import PNG from 'png-js';
import { decodeJpegDc } from './jpeg-dc';

/**
 * Pure-JavaScript image handling. The production release must not carry native addons
 * (deploy/build-release.sh rejects *.node files), so no sharp/canvas: JPEG and PNG headers
 * are parsed here, thumbnails are decoded with jpeg-js / png-js one photo at a time.
 * The print PDF embeds the original JPEG bytes untouched (no re-encoding, full quality).
 */

export type ImageType = 'jpeg' | 'png' | 'webp' | 'heic' | 'unknown';

export interface ImageInfo {
  type: ImageType;
  /** Size after applying the EXIF orientation (what the viewer sees). */
  width: number;
  height: number;
  /** EXIF orientation 1–8 (JPEG only). */
  orientation: number;
}

export function sniff(data: Uint8Array): ImageType {
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpeg';
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'png';
  const ascii = (from: number, to: number) => Buffer.from(data.subarray(from, to)).toString('ascii');
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(4, 8) === 'ftyp') return 'heic';
  return 'unknown';
}

export function probe(data: Uint8Array): ImageInfo {
  const type = sniff(data);
  if (type === 'png') {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return { type, width: view.getUint32(16), height: view.getUint32(20), orientation: 1 };
  }
  if (type !== 'jpeg') return { type, width: 0, height: 0, orientation: 1 };
  const { width, height, orientation } = readJpegHeader(data);
  const swap = orientation >= 5 && orientation <= 8;
  return { type, width: swap ? height : width, height: swap ? width : height, orientation };
}

function readJpegHeader(data: Uint8Array): { width: number; height: number; orientation: number } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 2;
  let orientation = 1;
  while (offset + 4 <= data.length) {
    if (data[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = data[offset + 1]!;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) {
      offset += marker === 0xff ? 1 : 2;
      continue;
    }
    const length = view.getUint16(offset + 2);
    if (marker === 0xe1 && length > 8) orientation = readExifOrientation(data, offset + 4, length - 2) ?? orientation;
    // SOF0–SOF15 except DHT (C4), JPG (C8), DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7), orientation };
    }
    offset += 2 + length;
  }
  throw new Error('JPEG without a frame header');
}

function readExifOrientation(data: Uint8Array, start: number, length: number): number | null {
  if (Buffer.from(data.subarray(start, start + 4)).toString('ascii') !== 'Exif') return null;
  const tiff = start + 6;
  if (tiff + 8 > data.length || tiff + 8 > start + length) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const little = data[tiff] === 0x49;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > data.length) return null;
  const entries = u16(ifd);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > data.length) return null;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

export interface Raster {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Uint8Array;
}

/** jpeg-js needs ~40 bytes per pixel; above this size the DC decoder is used. */
const FULL_DECODE_LIMIT = 3_000_000;

/**
 * Makes a small upright JPEG for page previews. Photos are processed one by one and the
 * result is cached in media, so later layout versions reuse it.
 */
export async function thumbnail(data: Uint8Array, maxSide: number, quality = 72): Promise<{ data: Buffer; width: number; height: number }> {
  const type = sniff(data);
  let raster: Raster;
  let orientation = 1;
  if (type === 'jpeg') {
    const info = probe(data);
    orientation = info.orientation;
    if (info.width * info.height > FULL_DECODE_LIMIT) {
      // Large photos: 1/8-scale decode from DC coefficients, a few MB instead of hundreds.
      raster = decodeJpegDc(data);
    } else {
      const decoded = jpeg.decode(data, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 200, maxResolutionInMP: 4 });
      raster = { width: decoded.width, height: decoded.height, data: decoded.data };
    }
  } else if (type === 'png') {
    const png = new PNG(Buffer.from(data));
    raster = { width: png.width, height: png.height, data: await png.decode() };
  } else {
    throw new Error(`Cannot make a thumbnail of ${type}`);
  }
  const scaled = downscale(raster, maxSide);
  raster = { width: 0, height: 0, data: new Uint8Array(0) }; // let the full-size buffer go before encoding
  const upright = orient(scaled, orientation);
  const encoded = jpeg.encode({ width: upright.width, height: upright.height, data: flattenAlpha(upright.data) }, quality);
  return { data: encoded.data, width: upright.width, height: upright.height };
}

/** Box-filter downscale (area average): good quality for large reductions, no dependencies. */
export function downscale(source: Raster, maxSide: number): Raster {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  if (width === source.width && height === source.height) return source;
  const out = new Uint8Array(width * height * 4);
  const xRatio = source.width / width;
  const yRatio = source.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * yRatio);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * yRatio));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * xRatio);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * xRatio));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = y0; sy < y1; sy++) {
        let i = (sy * source.width + x0) * 4;
        for (let sx = x0; sx < x1; sx++, i += 4) {
          r += source.data[i]!;
          g += source.data[i + 1]!;
          b += source.data[i + 2]!;
          a += source.data[i + 3]!;
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const o = (y * width + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = a / n;
    }
  }
  return { width, height, data: out };
}

/** Applies an EXIF orientation to pixels, so the thumbnail is upright. */
export function orient(source: Raster, orientation: number): Raster {
  if (orientation <= 1 || orientation > 8) return source;
  const { width: w, height: h } = source;
  const swap = orientation >= 5;
  const width = swap ? h : w;
  const height = swap ? w : h;
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let nx: number;
      let ny: number;
      switch (orientation) {
        case 2: [nx, ny] = [w - 1 - x, y]; break;
        case 3: [nx, ny] = [w - 1 - x, h - 1 - y]; break;
        case 4: [nx, ny] = [x, h - 1 - y]; break;
        case 5: [nx, ny] = [y, x]; break;
        case 6: [nx, ny] = [h - 1 - y, x]; break;
        case 7: [nx, ny] = [h - 1 - y, w - 1 - x]; break;
        default: [nx, ny] = [y, w - 1 - x]; break; // 8
      }
      const i = (y * w + x) * 4;
      const o = (ny * width + nx) * 4;
      out[o] = source.data[i]!;
      out[o + 1] = source.data[i + 1]!;
      out[o + 2] = source.data[i + 2]!;
      out[o + 3] = source.data[i + 3]!;
    }
  }
  return { width, height, data: out };
}

/** JPEG has no alpha: composite transparent pixels over white. */
function flattenAlpha(data: Uint8Array): Uint8Array {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]! / 255;
    if (a === 1) continue;
    data[i] = data[i]! * a + 255 * (1 - a);
    data[i + 1] = data[i + 1]! * a + 255 * (1 - a);
    data[i + 2] = data[i + 2]! * a + 255 * (1 - a);
    data[i + 3] = 255;
  }
  return data;
}
