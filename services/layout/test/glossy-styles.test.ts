import type { LayoutSource } from '@px/contracts';
import { describe, expect, it } from 'vitest';
import { hexToRgb, rgbToHsl, vividColor } from '../src/domain/color';
import { mm } from '../src/domain/document';
import { FontLibrary } from '../src/infrastructure/fonts';
import { glossyTemplate } from '../src/templates/glossy';
import { GLOSSY_STYLES, themeFor } from '../src/templates/glossy-themes';
import type { PhotoLibrary } from '../src/templates';
import * as f from './fixtures/materials';

const fonts = new FontLibrary();
const DEEP_RED = '#6f0117';
/** Portraits; the cover photo carries a vivid red, like a red sweater. */
const photos: PhotoLibrary = {
  get: (ref) => ({ key: `${ref.id}.jpg`, width: 900, height: 1200, ...(ref.id === 'cover0' ? { vivid: DEEP_RED } : {}) }),
};

function build(source: LayoutSource, draft = f.glossyDraft) {
  return glossyTemplate.build({ product: f.products.glossy, source, draft, photos }, fonts);
}

function withStyle(style: string): LayoutSource {
  const source = f.glossySource();
  return { ...source, answers: { ...source.answers, hero: { ...source.answers.hero, tone: style } } };
}

function texts(doc: ReturnType<typeof build>, kind?: string) {
  return doc.pages
    .filter((p) => !kind || p.kind === kind)
    .flatMap((p) => p.elements.flatMap((e) => (e.type === 'text' ? e.lines.map((l) => l.pieces.map((x) => x.text).join(' ')) : [])))
    .join(' ');
}

describe('Cover Me styles', () => {
  it.each(GLOSSY_STYLES)('builds the full issue in the %s style', (style) => {
    const doc = build(withStyle(style));
    expect(doc.pages).toHaveLength(24);
    expect(doc.pages[0]!.kind).toBe('cover');
    expect(doc.pages.at(-1)!.kind).toBe('back');
    expect(doc.template).toBe('glossy-magazine@4');
  });

  it('sets each style in its own typefaces and colours', () => {
    const coverFonts = (style: string) => {
      const cover = build(withStyle(style)).pages[0]!;
      return new Set(cover.elements.flatMap((e) => (e.type === 'text' ? e.lines.flatMap((l) => l.pieces.map((p) => p.font)) : [])));
    };
    expect(coverFonts('tabloid')).toContain('dela-400');
    expect(coverFonts('tender')).toContain('cormorant-300-italic');
    expect(coverFonts('noir')).toContain('cormorant-600');
    expect(build(withStyle('noir')).pages[2]!.background).toBe(themeFor('noir').paper);
  });

  it('takes the accent of Глянец from the cover photo and keeps the tabloid red', () => {
    const vogue = themeFor('vogue', DEEP_RED);
    expect(vogue.accent).not.toBe(themeFor('vogue').accent);
    const hue = rgbToHsl(hexToRgb(vogue.accent)).h;
    expect(hue > 330 || hue < 15).toBe(true); // still red
    expect(themeFor('tabloid', DEEP_RED).accent).toBe(themeFor('tabloid').accent);
    // The words page is set on the issue's accent.
    expect(build(withStyle('vogue')).pages.find((p) => p.kind === 'words')!.background).toBe(vogue.accent);
  });

  it('uses the AI art direction: personal rubric titles, tagline and a horoscope page', () => {
    const draft = {
      ...f.glossyDraft,
      art: {
        tagline: 'Женщина, которая доходит до озера',
        horoscope: 'Стрелец, этот год ваш. Только не опаздывайте на плов.',
        rubrics: [{ rubric: 'rules', title: 'Кодекс Айгерим', deck: 'Шесть правил без исключений' }],
      },
    };
    const doc = build(withStyle('vogue'), draft);
    expect(texts(doc, 'rules')).toContain('Кодекс');
    expect(texts(doc, 'cover')).toContain('озера');
    expect(doc.pages.map((p) => p.kind)).toContain('horoscope');
    expect(texts(doc, 'horoscope')).toContain('Стрелец');
    // Without the AI the template words its own, still personal, titles.
    expect(build(withStyle('vogue')).pages.map((p) => p.kind)).not.toContain('horoscope');
    expect(texts(build(withStyle('vogue')), 'tastes')).toContain('Что любит Айгерим');
  });
});

describe('Cover Me portrait covers', () => {
  /** A head-and-shoulders outline with room above the head. */
  const silhouette = (top: number) => ({
    outline: [0.3, 1, 0.32, 0.55, 0.38, top + 0.05, 0.5, top, 0.62, top + 0.05, 0.68, 0.55, 0.7, 1],
    box: { x: 0.3, y: top, w: 0.4, h: 1 - top },
    head: { top, cx: 0.5, width: 0.2, height: 0.2 },
    area: 0.35,
  });
  const traced = (top: number): PhotoLibrary => ({
    get: (ref) => ({ key: `${ref.id}.jpg`, width: 3000, height: 4000, ...(ref.id === 'cover0' ? { silhouette: silhouette(top) } : {}) }),
  });
  const cover = (style: string, library: PhotoLibrary) =>
    glossyTemplate.build({ product: f.products.glossy, source: withStyle(style), draft: f.glossyDraft, photos: library }, fonts).pages[0]!;
  const cutouts = (page: ReturnType<typeof cover>) => page.elements.filter((e) => e.type === 'image' && e.cutout);

  it.each(['vogue', 'tabloid', 'noir'])('puts the head in front of the masthead in the %s style', (style) => {
    const page = cover(style, traced(0.12));
    const [cutout] = cutouts(page);
    expect(cutout).toBeDefined();
    const photo = page.elements.find((e) => e.type === 'image' && !e.cutout)!;
    // Same placement as the photo below, drawn after the masthead.
    expect(cutout!.type === 'image' && photo.type === 'image' && cutout!.crop).toEqual(photo.type === 'image' && photo.crop);
    const masthead = page.elements.findIndex((e) => e.type === 'text' && e.lines[0]!.pieces.some((p) => /cover/i.test(p.text)));
    expect(page.elements.indexOf(cutout!)).toBeGreaterThan(masthead);
    // The head top lands inside the masthead band.
    if (cutout!.type === 'image') {
      const headTop = cutout!.crop!.y + 0.12 * cutout!.crop!.h;
      expect(headTop).toBeGreaterThan(mm(15));
      expect(headTop).toBeLessThan(mm(40));
      expect(cutout!.cutout!.overlays!.length).toBeGreaterThan(0);
    }
  });

  it('keeps the tender print calm and gives up the cut-out without headroom', () => {
    expect(cutouts(cover('tender', traced(0.12)))).toHaveLength(0);
    // A head touching the top edge of the photo would show a flat cut in the masthead.
    expect(cutouts(cover('vogue', traced(0)))).toHaveLength(0);
  });

  it('keeps cover lines and the burst off the face', () => {
    const page = cover('tabloid', traced(0.12));
    const photo = page.elements.find((e) => e.type === 'image' && !e.cutout)!;
    if (photo.type !== 'image') throw new Error('no photo');
    const headLeft = photo.crop!.x + (0.5 - 0.1) * photo.crop!.w;
    const headBottom = photo.crop!.y + (0.12 + 0.2) * photo.crop!.h;
    // Cover-line bars (the barcode below the name is black too).
    const bars = page.elements.filter((e) => e.type === 'rect' && e.fill === '#000000' && e.box.y < mm(200));
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) if (bar.type === 'rect') expect(bar.box.x + bar.box.w).toBeLessThanOrEqual(headLeft);
    const burst = page.elements.find((e) => e.type === 'path');
    if (burst?.type === 'path') {
      const ys = burst.d.match(/-?\d+\.\d+/g)!.map(Number).filter((_, i) => i % 2 === 1);
      expect(Math.min(...ys)).toBeGreaterThan(headBottom);
    }
  });

  it('lays out a photo without a silhouette as before', () => {
    expect(cutouts(cover('vogue', photos))).toHaveLength(0);
  });
});

describe('vivid colour of a photo', () => {
  it('finds the red of a sweater and ignores skin and greys', () => {
    const pixels = new Uint8Array(100 * 4);
    for (let i = 0; i < 100; i++) {
      const rgb = i < 40 ? [140, 10, 30] : i < 70 ? [224, 172, 140] : [120, 120, 120];
      pixels.set([...rgb, 255], i * 4);
    }
    const color = vividColor(pixels)!;
    expect(color.h > 330 || color.h < 10).toBe(true);
  });

  it('returns nothing for a black-and-white photo', () => {
    const pixels = new Uint8Array(100 * 4);
    for (let i = 0; i < 100; i++) pixels.set([i * 2, i * 2, i * 2, 255], i * 4);
    expect(vividColor(pixels)).toBeNull();
  });
});
