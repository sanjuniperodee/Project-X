import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inputSize, outlinePath, PORTRAIT_MODELS, portraitCrop, toInputTensor, traceSilhouette } from '../src';

/** A head (circle) on shoulders (a wide block below a neck), as a soft matte. */
function bust(width: number, height: number, cx = 0.5) {
  const matte = new Float32Array(width * height);
  const head = { x: width * cx, y: height * 0.3, r: width * 0.14 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inHead = (x - head.x) ** 2 + (y - head.y) ** 2 <= head.r ** 2;
      const inNeck = Math.abs(x - head.x) <= width * 0.06 && y > head.y && y < height * 0.55;
      const inShoulders = Math.abs(x - head.x) <= width * 0.38 && y >= height * 0.55;
      matte[y * width + x] = inHead || inNeck || inShoulders ? 0.98 : 0.02;
    }
  }
  return matte;
}

describe('traceSilhouette', () => {
  it('finds the head, its centre and the outline of a bust', () => {
    const s = traceSilhouette(bust(200, 300), 200, 300)!;
    expect(s).not.toBeNull();
    expect(s.head.top).toBeCloseTo(0.3 - 0.14 * (200 / 300), 1);
    expect(s.head.cx).toBeCloseTo(0.5, 1);
    expect(s.head.width).toBeCloseTo(0.28, 1);
    expect(s.box.w).toBeCloseTo(0.76, 1);
    expect(s.outline.length).toBeGreaterThan(16);
    expect(s.outline.every((v) => v >= -0.01 && v <= 1.01)).toBe(true);
    // Simplified: far fewer points than the perimeter in pixels.
    expect(s.outline.length / 2).toBeLessThan(200);
  });

  it('keeps only the largest blob and fills its holes', () => {
    const matte = bust(200, 300, 0.4);
    for (let y = 10; y < 20; y++) for (let x = 180; x < 190; x++) matte[y * 200 + x] = 1; // speck
    for (let y = 250; y < 260; y++) for (let x = 70; x < 80; x++) matte[y * 200 + x] = 0; // hole
    const s = traceSilhouette(matte, 200, 300)!;
    expect(s.box.x + s.box.w).toBeLessThan(0.9);
    const clean = traceSilhouette(bust(200, 300, 0.4), 200, 300)!;
    expect(s.area).toBeCloseTo(clean.area, 3);
  });

  it('returns null without a person', () => {
    expect(traceSilhouette(new Float32Array(100 * 100).fill(0.01), 100, 100)).toBeNull();
    expect(traceSilhouette(new Float32Array(100 * 100).fill(0.99), 100, 100)).toBeNull();
  });
});

describe('portraitCrop', () => {
  const s = { head: { top: 0.2, cx: 0.6, width: 0.25, height: 0.3 } };
  const photo = { width: 3000, height: 4000 };
  const frame = { x: 0, y: 0, w: 595, h: 842 };

  it('zooms to the head width and puts the head on the target', () => {
    const crop = portraitCrop(photo, s, frame, { headTop: 100, centerX: 297.5, headWidth: 220 });
    expect(crop.w * 0.25).toBeCloseTo(220, 0);
    expect(crop.y + 0.2 * crop.h).toBeCloseTo(100, 0);
    expect(crop.x + 0.6 * crop.w).toBeCloseTo(297.5, 0);
  });

  it('always covers the frame and respects the zoom limit', () => {
    const small = portraitCrop(photo, s, frame, { headTop: 0, centerX: 0, headWidth: 10 });
    expect(small.w).toBeGreaterThanOrEqual(frame.w - 0.01);
    expect(small.h).toBeGreaterThanOrEqual(frame.h - 0.01);
    expect(small.x).toBeLessThanOrEqual(0);
    expect(small.y).toBeLessThanOrEqual(0);
    expect(small.x + small.w).toBeGreaterThanOrEqual(frame.w - 0.01);
    const capped = portraitCrop(photo, s, frame, { headTop: 100, centerX: 300, headWidth: 5000 }, 0.48);
    expect(capped.w / photo.width).toBeCloseTo(0.48, 3);
  });

  it('places the outline as path data', () => {
    expect(outlinePath({ outline: [0, 0, 1, 0, 1, 1] }, { x: 10, y: 20, w: 100, h: 200 })).toBe('M10.00 20.00 L110.00 20.00 L110.00 220.00 Z');
  });
});

describe('model input', () => {
  it('has a short side of 512 and sides divisible by 32', () => {
    expect(inputSize(3000, 4000)).toEqual({ width: 512, height: 672 });
    expect(inputSize(1080, 1920)).toEqual({ width: 512, height: 896 });
    const rgba = new Uint8Array(4 * 40 * 60).fill(255);
    const tensor = toInputTensor(rgba, 40, 60);
    expect(tensor.data.length).toBe(3 * tensor.width * tensor.height);
    expect(tensor.data[0]).toBeCloseTo(1);
  });

  it('pins the same weights in the download script', () => {
    const script = readFileSync(new URL('../scripts/fetch-model.mjs', import.meta.url), 'utf8');
    for (const model of Object.values(PORTRAIT_MODELS)) {
      expect(script).toContain(model.url);
      expect(script).toContain(model.sha256);
    }
  });
});
