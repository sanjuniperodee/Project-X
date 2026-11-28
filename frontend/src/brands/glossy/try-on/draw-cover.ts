import { COVER_PAGE, cutoutBand, COVER_ME_HEADS, outlinePath, placeCoverPortrait, type CoverMeStyle, type CoverPortrait, type Silhouette } from '@px/portrait';
import { fit, measure, type Box, type TextSpec } from './canvas-text';

/**
 * The Cover Me covers on a canvas, composed like the print layout
 * (services/layout/src/templates/glossy-covers.ts): same positions in points, same head
 * placement (shared through `@px/portrait`), same shades and cut-out. Draws one A4 page with
 * 1 unit = 1 pt; the caller scales the context.
 */
export interface CoverPhoto {
  image: CanvasImageSource;
  /** Size of the original photo, px (the zoom limit is measured on it). */
  width: number;
  height: number;
  silhouette: Silhouette | null;
}

export interface CoverLine {
  title: string;
  text: string;
}

export interface CoverContent {
  name: string;
  issueLine: string;
  lines: CoverLine[];
  tagline: string;
}

/** CSS font families of the page (next/font variables). */
export interface CoverFonts {
  playfair: string;
  inter: string;
  dela: string;
  oswald: string;
  cormorant: string;
}

const MM = 72 / 25.4;
const mm = (value: number) => value * MM;
const W = COVER_PAGE.w;
const H = COVER_PAGE.h;
const BLEED = COVER_PAGE.bleed;
const MARGIN = mm(15);
const CONTENT_W = W - 2 * MARGIN;
const FULL: Box = { x: -BLEED, y: -BLEED, w: W + 2 * BLEED, h: H + 2 * BLEED };
const PRICE = 'Цена: бесценно';

export const COVER_SIZE = { w: W, h: H };

export function drawCover(ctx: CanvasRenderingContext2D, style: CoverMeStyle, photo: CoverPhoto | null, content: CoverContent, fonts: CoverFonts) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  const portrait = photo?.silhouette ? placeCoverPortrait(style, photo, photo.silhouette) : undefined;
  const layers = new PhotoLayers(ctx, photo, portrait);
  ({ vogue: vogueCover, tabloid: tabloidCover, tender: tenderCover, noir: noirCover })[style](ctx, layers, content, fonts);
  ctx.restore();
}

/** The cover photo, the shades laid over it, and the cut-out head that repeats them. */
class PhotoLayers {
  private readonly shades: Array<() => void> = [];

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    readonly photo: CoverPhoto | null,
    readonly portrait: CoverPortrait | undefined,
  ) {}

  /** Draws the photo into `frame`; `focusY` places photos without a silhouette. */
  draw(frame: Box, focusY: number) {
    const { ctx, photo } = this;
    if (!photo) return;
    const crop = this.crop(frame, focusY);
    ctx.save();
    ctx.beginPath();
    ctx.rect(frame.x, frame.y, frame.w, frame.h);
    ctx.clip();
    ctx.drawImage(photo.image, crop.x, crop.y, crop.w, crop.h);
    ctx.restore();
  }

  /** A vertical gradient of `color` over the photo (also repeated on the cut-out). */
  shade(color: string, from: number, to: number, max: number, direction: 'up' | 'down') {
    const paint = () => {
      const gradient = this.ctx.createLinearGradient(0, from, 0, to);
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const strength = direction === 'up' ? t : 1 - t;
        gradient.addColorStop(t, rgba(color, max * strength * strength));
      }
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(-BLEED, from, W + 2 * BLEED, to - from);
    };
    paint();
    this.shades.push(paint);
  }

  /** Darkens from the left edge to `width`, under cover lines. */
  sideShade(color: string, width: number, max: number) {
    const paint = () => {
      const gradient = this.ctx.createLinearGradient(-BLEED, 0, width, 0);
      for (const t of [0, 0.35, 0.7, 1]) gradient.addColorStop(t, rgba(color, max * (1 - t) ** 1.6));
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(-BLEED, -BLEED, width + BLEED, H + 2 * BLEED);
    };
    paint();
    this.shades.push(paint);
  }

  /** The person again, in front of what is drawn by now, above the style's cut-out line. */
  cutout(style: CoverMeStyle, outline?: { color: string; width: number }) {
    const { ctx, photo, portrait } = this;
    if (!photo?.silhouette || !portrait?.depth) return;
    const band = cutoutBand(style);
    const person = new Path2D(outlinePath(photo.silhouette, portrait.crop));
    ctx.save();
    ctx.beginPath();
    ctx.rect(band.x, band.y, band.w, band.h);
    ctx.clip();
    if (outline) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = outline.width * 2;
      ctx.strokeStyle = outline.color;
      ctx.stroke(person);
    }
    ctx.clip(person);
    const { crop } = portrait;
    ctx.drawImage(photo.image, crop.x, crop.y, crop.w, crop.h);
    for (const paint of this.shades) paint();
    ctx.restore();
  }

  private crop(frame: Box, focusY: number): Box {
    const { photo, portrait } = this;
    if (portrait) return portrait.crop;
    const scale = Math.max(frame.w / photo!.width, frame.h / photo!.height);
    const w = photo!.width * scale;
    const h = photo!.height * scale;
    return { x: frame.x + (frame.w - w) / 2, y: frame.y + (frame.h - h) * focusY, w, h };
  }
}

/** Cover-lines column from the left margin, narrowed to stay off the face. */
function linesWidth(portrait: CoverPortrait | undefined, preferred: number, min = mm(54)) {
  return portrait ? Math.max(min, Math.min(preferred, portrait.head.x - MARGIN - mm(5))) : preferred;
}

function rect(ctx: CanvasRenderingContext2D, box: Box, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(box.x, box.y, box.w, box.h);
}

function frame(ctx: CanvasRenderingContext2D, box: Box, color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
}

function folio(f: CoverFonts, color: string, size: number, extra: Partial<TextSpec> = {}): TextSpec {
  return { family: f.inter, weight: 600, size, leading: 1, color, tracking: 1.4, uppercase: true, ...extra };
}

function vogueCover(ctx: CanvasRenderingContext2D, p: PhotoLayers, c: CoverContent, f: CoverFonts) {
  const ink = '#ffffff';
  const accent = '#e4007c';
  rect(ctx, FULL, p.photo ? '#000000' : accent);
  const column = linesWidth(p.portrait, mm(74));
  if (p.photo) {
    p.draw(FULL, 0.22);
    p.shade('#000000', -BLEED, mm(70), 0.45, 'down');
    p.shade('#000000', H - mm(110), H + BLEED, 0.6, 'up');
    p.sideShade('#000000', MARGIN + column + mm(40), 0.55);
  }
  fit(ctx, 'COVER ME', { family: f.playfair, weight: 900, size: 150, leading: 0.9, color: ink, align: 'center', tracking: -1 }, { x: mm(8), y: mm(9), w: W - mm(16), h: mm(44) }, { minSize: 70, maxLines: 1 });
  p.cutout('vogue');
  const strip = { x: MARGIN, y: mm(50), w: CONTENT_W, h: mm(5) };
  fit(ctx, c.issueLine, folio(f, ink, 7.5), strip, { minSize: 5, maxLines: 1 });
  fit(ctx, PRICE, folio(f, ink, 7.5, { align: 'right' }), strip, { minSize: 5, maxLines: 1 });

  let y = mm(78);
  c.lines.slice(0, 4).forEach((line, i) => {
    if (i === 0) {
      rect(ctx, { x: MARGIN, y: y - mm(1), w: mm(26), h: mm(5.5) }, accent);
      fit(ctx, 'Эксклюзив', { family: f.inter, weight: 700, size: 7, leading: 1, color: '#ffffff', align: 'center', tracking: 1.6, uppercase: true }, { x: MARGIN, y: y + mm(0.4), w: mm(26), h: mm(4) }, { minSize: 5, maxLines: 1 });
      y += mm(8);
    }
    const box = { x: MARGIN, y, w: column, h: mm(24) };
    const used = fit(ctx, line.title, { family: f.playfair, weight: 900, size: i === 0 ? 24 : 18, leading: 1.02, color: ink }, box, { minSize: 12, maxLines: 2 });
    const textUsed = fit(ctx, line.text, { family: f.inter, weight: 600, size: 8.5, leading: 1.3, color: ink }, { ...box, y: y + used + mm(1.2), h: mm(10) }, { minSize: 7, maxLines: 2 });
    rect(ctx, { x: MARGIN, y: y + used + textUsed + mm(3.5), w: mm(10), h: 1.4 }, accent);
    y += used + textUsed + mm(9);
  });

  fit(ctx, c.name, { family: f.playfair, weight: 900, italic: true, size: 120, leading: 0.9, color: ink }, { x: MARGIN, y: H - mm(74), w: CONTENT_W - mm(34), h: mm(50) }, { minSize: 40, maxLines: 2, verticalAlign: 'bottom' });
  fit(ctx, c.tagline, { family: f.inter, weight: 600, size: 8.5, leading: 1.3, color: ink, tracking: 0.6 }, { x: MARGIN, y: H - mm(20), w: mm(130), h: mm(6) }, { minSize: 6, maxLines: 1 });
  barcode(ctx, f, { x: W - MARGIN - mm(28), y: H - mm(34), w: mm(28), h: mm(18) }, c.name, ink);
}

function tabloidCover(ctx: CanvasRenderingContext2D, p: PhotoLayers, c: CoverContent, f: CoverFonts) {
  const red = '#e10600';
  const yellow = '#ffe600';
  rect(ctx, FULL, p.photo ? '#000000' : yellow);
  const column = linesWidth(p.portrait, mm(92), mm(58));
  if (p.photo) {
    p.draw(FULL, 0.2);
    p.shade('#000000', H - mm(120), H + BLEED, 0.75, 'up');
    p.sideShade('#000000', MARGIN + column + mm(30), 0.5);
  }
  rect(ctx, { x: -BLEED, y: -BLEED, w: FULL.w, h: mm(46) + BLEED }, red);
  fit(ctx, 'COVER ME', { family: f.dela, size: 120, leading: 0.9, color: '#ffffff', align: 'center' }, { x: mm(8), y: mm(8), w: W - mm(16), h: mm(34) }, { minSize: 50, maxLines: 1 });
  rect(ctx, { x: -BLEED, y: mm(46), w: FULL.w, h: mm(8) }, yellow);
  const strip = { x: MARGIN, y: mm(48.2), w: CONTENT_W, h: mm(4) };
  fit(ctx, c.issueLine, folio(f, '#111111', 7.5), strip, { minSize: 5, maxLines: 1 });
  fit(ctx, PRICE, folio(f, '#111111', 7.5, { align: 'right' }), strip, { minSize: 5, maxLines: 1 });
  p.cutout('tabloid', { color: '#ffffff', width: 2.4 });

  let y = mm(66);
  c.lines.slice(0, 4).forEach((line, i) => {
    const title: TextSpec = { family: f.oswald, weight: 700, size: i === 0 ? 30 : 21, leading: 1.02, color: yellow, uppercase: true };
    const width = Math.min(column, measure(ctx, line.title.toLocaleUpperCase('ru-RU'), title, title.size) + mm(6));
    // The bar's height depends on how the title sets: measure on a scratch pass, then paint bar and text.
    const used = withoutPainting(ctx, () => fit(ctx, line.title, title, { x: MARGIN + mm(3), y: y + mm(1.5), w: width - mm(4), h: mm(26) }, { minSize: 13, maxLines: 2 }));
    rect(ctx, { x: MARGIN, y, w: width, h: used + mm(3) }, '#000000');
    fit(ctx, line.title, title, { x: MARGIN + mm(3), y: y + mm(1.5), w: width - mm(4), h: mm(26) }, { minSize: 13, maxLines: 2 });
    const textUsed = fit(ctx, line.text, { family: f.inter, weight: 700, size: 9, leading: 1.25, color: '#ffffff' }, { x: MARGIN, y: y + used + mm(4.5), w: Math.min(mm(80), column), h: mm(10) }, { minSize: 7, maxLines: 2 });
    y += used + textUsed + mm(10);
  });

  const cx = W - MARGIN - mm(22);
  const radius = mm(24);
  let cy: number | undefined = mm(86);
  if (p.portrait) {
    const { head } = p.portrait;
    const overlapsX = cx + radius > head.x && cx - radius < head.x + head.w;
    cy = overlapsX ? Math.max(mm(86), head.y + head.h + radius + mm(4)) : mm(86);
    if (cy + radius > H - mm(84)) cy = undefined;
  }
  if (cy !== undefined) {
    ctx.fillStyle = yellow;
    ctx.fill(burst(cx, cy, radius, mm(19), 18));
    fit(ctx, 'Сенсация!', { family: f.oswald, weight: 700, size: 17, leading: 1, color: red, align: 'center', uppercase: true }, { x: cx - mm(18), y: cy - mm(6), w: mm(36), h: mm(8) }, { minSize: 10, maxLines: 1 });
    fit(ctx, 'Все тайны раскрыты', { family: f.inter, weight: 700, size: 7.5, leading: 1.15, color: '#111111', align: 'center' }, { x: cx - mm(16), y: cy + mm(2.5), w: mm(32), h: mm(8) }, { minSize: 5.5, maxLines: 2 });
  }

  fit(ctx, c.name, { family: f.dela, size: 110, leading: 0.92, color: '#ffffff', uppercase: true }, { x: MARGIN, y: H - mm(80), w: CONTENT_W - mm(32), h: mm(54) }, { minSize: 36, maxLines: 2, verticalAlign: 'bottom' });
  rect(ctx, { x: MARGIN, y: H - mm(23), w: mm(130), h: mm(7) }, red);
  fit(ctx, c.tagline, { family: f.inter, weight: 700, size: 8.5, leading: 1, color: '#ffffff', uppercase: true, tracking: 0.8 }, { x: MARGIN + mm(2.5), y: H - mm(21), w: mm(126), h: mm(4) }, { minSize: 5.5, maxLines: 1 });
  rect(ctx, { x: W - MARGIN - mm(30), y: H - mm(37), w: mm(30), h: mm(22) }, '#ffffff');
  barcode(ctx, f, { x: W - MARGIN - mm(28), y: H - mm(35), w: mm(26), h: mm(18) }, c.name, '#000000');
}

function tenderCover(ctx: CanvasRenderingContext2D, p: PhotoLayers, c: CoverContent, f: CoverFonts) {
  const paper = '#fdfaf7';
  const ink = '#3b302c';
  const muted = '#8c7d76';
  const accent = '#b86f6a';
  rect(ctx, FULL, paper);
  fit(ctx, 'cover me', { family: f.cormorant, weight: 300, italic: true, size: 150, leading: 0.85, color: ink, align: 'center' }, { x: mm(10), y: mm(8), w: W - mm(20), h: mm(44) }, { minSize: 70, maxLines: 1 });
  const strip = { x: mm(22), y: mm(52), w: W - mm(44), h: mm(5) };
  fit(ctx, c.issueLine, folio(f, muted, 7), strip, { minSize: 5, maxLines: 1 });
  fit(ctx, PRICE, folio(f, muted, 7, { align: 'right' }), strip, { minSize: 5, maxLines: 1 });

  const box = COVER_ME_HEADS.tender.frame;
  if (p.photo) {
    p.draw(box, 0.25);
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    p.shade('#2a201c', box.y + box.h - mm(60), box.y + box.h, 0.5, 'up');
    ctx.restore();
  } else rect(ctx, box, '#f4e7e2');
  frame(ctx, { x: box.x - mm(4), y: box.y - mm(4), w: box.w + mm(8), h: box.h + mm(8) }, accent, 0.6);

  let y = box.y + box.h - mm(38);
  for (const line of c.lines.slice(0, 2)) {
    const used = fit(ctx, line.title, { family: f.cormorant, weight: 600, italic: true, size: 19, leading: 1.05, color: '#ffffff' }, { x: box.x + mm(8), y, w: mm(90), h: mm(12) }, { minSize: 11, maxLines: 1 });
    fit(ctx, line.text, { family: f.inter, weight: 400, size: 7.8, leading: 1.3, color: '#ffffff' }, { x: box.x + mm(8), y: y + used + mm(0.5), w: mm(90), h: mm(8) }, { minSize: 6, maxLines: 1 });
    y += used + mm(13);
  }

  fit(ctx, c.name, { family: f.cormorant, weight: 600, italic: true, size: 64, leading: 0.95, color: accent, align: 'center' }, { x: mm(16), y: box.y + box.h + mm(7), w: W - mm(32), h: mm(26) }, { minSize: 28, maxLines: 1 });
  fit(ctx, c.tagline, { family: f.cormorant, weight: 500, italic: true, size: 13, leading: 1.2, color: muted, align: 'center' }, { x: mm(16), y: H - mm(17), w: W - mm(32), h: mm(7) }, { minSize: 8, maxLines: 1 });
}

function noirCover(ctx: CanvasRenderingContext2D, p: PhotoLayers, c: CoverContent, f: CoverFonts) {
  const gold = '#c9a24a';
  const ink = '#eee7dc';
  rect(ctx, FULL, '#0f0e0d');
  const column = linesWidth(p.portrait, mm(62), mm(50));
  if (p.photo) {
    p.draw(FULL, 0.25);
    p.shade('#000000', -BLEED, mm(80), 0.62, 'down');
    p.shade('#000000', H - mm(120), H + BLEED, 0.85, 'up');
    p.sideShade('#000000', mm(16) + column + mm(30), 0.5);
  }
  frame(ctx, { x: mm(7), y: mm(7), w: W - mm(14), h: H - mm(14) }, gold, 0.7);
  fit(ctx, 'COVER ME', { family: f.cormorant, weight: 600, size: 72, leading: 1, color: ink, align: 'center', tracking: 9 }, { x: mm(14), y: mm(16), w: W - mm(28), h: mm(26) }, { minSize: 36, maxLines: 1 });
  p.cutout('noir');
  fit(ctx, c.issueLine, folio(f, gold, 7, { align: 'center', tracking: 3 }), { x: mm(14), y: mm(42), w: W - mm(28), h: mm(5) }, { minSize: 5, maxLines: 1 });

  let y = mm(64);
  for (const line of c.lines.slice(0, 3)) {
    const used = fit(ctx, line.title, { family: f.cormorant, weight: 600, size: 14, leading: 1.15, color: ink, tracking: 2.2, uppercase: true }, { x: mm(16), y, w: column, h: mm(14) }, { minSize: 9, maxLines: 2 });
    fit(ctx, line.text, { family: f.cormorant, weight: 500, italic: true, size: 11, leading: 1.25, color: gold }, { x: mm(16), y: y + used + mm(1), w: column, h: mm(9) }, { minSize: 8, maxLines: 2 });
    rect(ctx, { x: mm(16), y: y + used + mm(12) - 0.3, w: mm(8), h: 0.6 }, gold);
    y += used + mm(19);
  }

  fit(ctx, c.name, { family: f.cormorant, weight: 600, italic: true, size: 120, leading: 0.9, color: gold }, { x: mm(16), y: H - mm(84), w: W - mm(32), h: mm(50) }, { minSize: 40, maxLines: 2, verticalAlign: 'bottom' });
  fit(ctx, c.tagline, { family: f.inter, weight: 600, size: 7.5, leading: 1.2, color: ink, tracking: 2.6, uppercase: true }, { x: mm(16), y: H - mm(27), w: mm(140), h: mm(5) }, { minSize: 5, maxLines: 1 });
  barcode(ctx, f, { x: W - mm(16) - mm(24), y: H - mm(36), w: mm(24), h: mm(15) }, c.name, ink);
}

/** Decorative EAN-like barcode from the name (same generator as the print). */
function barcode(ctx: CanvasRenderingContext2D, f: CoverFonts, box: Box, seed: string, color: string) {
  let hash = 2166136261;
  for (const ch of seed) hash = Math.imul(hash ^ ch.codePointAt(0)!, 16777619) >>> 0;
  const unit = box.w / 95;
  const barsH = box.h - mm(4);
  let x = box.x;
  ctx.fillStyle = color;
  for (let i = 0; i < 95 && x < box.x + box.w; i++) {
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
    const guard = i < 3 || i > 91 || (i > 45 && i < 49);
    const on = guard ? i % 2 === 0 : (hash & 3) !== 0;
    const width = unit * (guard ? 1 : 1 + (hash % 2));
    if (on) ctx.fillRect(x, box.y, width * 0.9, guard ? barsH + mm(1.5) : barsH);
    x += width;
  }
  fit(ctx, `4 607${String(hash % 1_000_000).padStart(6, '0')} 01`, { family: f.inter, weight: 600, size: 6.5, leading: 1, color, align: 'center', tracking: 1 }, { x: box.x, y: box.y + barsH + mm(1.2), w: box.w, h: mm(3) }, { minSize: 4, maxLines: 1 });
}

function burst(cx: number, cy: number, outer: number, inner: number, points: number): Path2D {
  const path = new Path2D();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    if (i === 0) path.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    else path.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  path.closePath();
  return path;
}

/** Runs a text fit for its measurement only. */
function withoutPainting<T>(ctx: CanvasRenderingContext2D, measureOnly: () => T): T {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 0, 0);
  ctx.clip();
  const result = measureOnly();
  ctx.restore();
  return result;
}

function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(alpha * 1000) / 1000})`;
}
