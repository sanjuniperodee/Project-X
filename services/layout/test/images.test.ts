import jpeg from 'jpeg-js';
import { describe, expect, it } from 'vitest';
import { orient, probe, sniff, thumbnail } from '../src/infrastructure/images';
import { decodeJpegDc } from '../src/infrastructure/jpeg-dc';
import { fakeJpeg } from './fixtures/materials';

/** Inserts an EXIF APP1 segment with the given orientation after SOI. */
function withOrientation(data: Buffer, orientation: number): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write('MM', 0, 'ascii');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8); // one IFD entry
  tiff.writeUInt16BE(0x0112, 10);
  tiff.writeUInt16BE(3, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(orientation, 18);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([data.subarray(0, 2), header, payload, data.subarray(2)]);
}

describe('images', () => {
  it('sniffs formats and reads JPEG size with EXIF orientation', () => {
    const photo = fakeJpeg(40, 20);
    expect(sniff(photo)).toBe('jpeg');
    expect(probe(photo)).toEqual({ type: 'jpeg', width: 40, height: 20, orientation: 1 });
    // Rotated 90°: shown portrait.
    expect(probe(withOrientation(photo, 6))).toEqual({ type: 'jpeg', width: 20, height: 40, orientation: 6 });
    expect(sniff(Buffer.from('RIFF0000WEBP'))).toBe('webp');
  });

  it('rotates pixels for an upright thumbnail', () => {
    // 2×1: red, blue → orientation 6 (90° clockwise) → 1×2: red on top, blue below.
    const raster = { width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]) };
    const upright = orient(raster, 6);
    expect([upright.width, upright.height]).toEqual([1, 2]);
    expect([...upright.data]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
    const left = orient(raster, 8);
    expect([...left.data]).toEqual([0, 0, 255, 255, 255, 0, 0, 255]);
  });

  it('decodes the DC image of a JPEG close to a full decode averaged per 8×8 block', () => {
    const photo = fakeJpeg(160, 96, 2);
    const dc = decodeJpegDc(photo);
    expect([dc.width, dc.height]).toEqual([20, 12]);
    const full = jpeg.decode(photo, { useTArray: true, formatAsRGBA: true });
    let maxError = 0;
    for (let by = 0; by < 12; by++) {
      for (let bx = 0; bx < 20; bx++) {
        for (let ch = 0; ch < 3; ch++) {
          let sum = 0;
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) sum += full.data[((by * 8 + y) * 160 + bx * 8 + x) * 4 + ch]!;
          maxError = Math.max(maxError, Math.abs(sum / 64 - dc.data[(by * 20 + bx) * 4 + ch]!));
        }
      }
    }
    expect(maxError).toBeLessThan(12); // chroma is subsampled, so a little colour bleed is expected
  });

  it('makes an upright thumbnail no larger than asked', async () => {
    const thumb = await thumbnail(withOrientation(fakeJpeg(300, 200), 6), 100);
    expect(probe(thumb.data)).toMatchObject({ width: 67, height: 100 });
  });
});
