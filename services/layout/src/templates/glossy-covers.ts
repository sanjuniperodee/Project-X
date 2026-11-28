import { COVER_ME_HEADS, cutoutBand, placeCoverPortrait, type CoverMeStyle, type CoverPortrait } from '@px/portrait';
import { A4, BLEED, mm, type PhotoRef } from '../domain/document';
import { barcode, CONTENT, FULL_BLEED, MARGIN, shade, sideShade, type Issue, type Styles } from './glossy-kit';
import type { Composer } from './template';

/**
 * Front and back covers of Cover Me, one composition per style:
 *  classic (Глянец)  — full-bleed portrait, huge Didone masthead, cover lines down the left
 *  tabloid (Таблоид) — red masthead band, yellow strip, shouting lines on black bars, a burst
 *  airy (Нежность)   — paper, an inset portrait, a light italic masthead, the name below
 *  noir (Нуар)       — full-bleed photo in deep shade, spaced capitals, a gold hairline frame
 */
export interface CoverLine {
  title: string;
  text: string;
}

const PRICE = 'Цена: бесценно';

/**
 * The traced cover photo placed for a style (shared with the try-on on the landing, see
 * `@px/portrait`): the head zoomed and positioned, in front of the masthead when the photo has
 * headroom. Photos without a silhouette keep the plain focus crop (undefined).
 */
function placePortrait(photo: PhotoRef | undefined, style: CoverMeStyle): CoverPortrait | undefined {
  return photo?.silhouette ? placeCoverPortrait(style, photo, photo.silhouette) : undefined;
}

/** Width of the cover-lines column from the left margin: `preferred`, narrowed to stay off the face. */
function linesWidth(portrait: CoverPortrait | undefined, preferred: number, min = mm(54)): number {
  if (!portrait) return preferred;
  return Math.max(min, Math.min(preferred, portrait.head.x - MARGIN - mm(5)));
}


export function coverPage(c: Composer, s: Styles, issue: Issue, photo: PhotoRef | undefined, lines: CoverLine[], tagline: string) {
  switch (s.t.cover) {
    case 'tabloid':
      return tabloidCover(c, s, issue, photo, lines, tagline);
    case 'airy':
      return airyCover(c, s, issue, photo, lines, tagline);
    case 'noir':
      return noirCover(c, s, issue, photo, lines, tagline);
    default:
      return classicCover(c, s, issue, photo, lines, tagline);
  }
}

function issueLine(issue: Issue): string {
  return ['№ 01', issue.month, issue.occasion].filter(Boolean).join('   ·   ');
}

function classicCover(c: Composer, s: Styles, issue: Issue, photo: PhotoRef | undefined, lines: CoverLine[], tagline: string) {
  const t = s.t;
  const page = c.addPage('cover', A4, photo ? t.shadow : t.accent);
  const portrait = placePortrait(photo, 'vogue');
  const column = linesWidth(portrait, mm(74));
  if (photo) {
    c.image(page, photo, FULL_BLEED, portrait ? { crop: portrait.crop } : { focusY: 0.22 });
    shade(c, s, page, -BLEED, mm(70), 0.45, 'down');
    shade(c, s, page, A4.h - mm(110), A4.h + BLEED, 0.6, 'up');
    // White cover lines stay readable over a bright background.
    sideShade(c, s, page, MARGIN + column + mm(40), 0.55);
  }
  c.fit(page, t.masthead, { font: t.fonts.masthead, size: 150, leading: 0.9, color: t.onPhoto, align: 'center', tracking: t.mastheadTracking }, { x: mm(8), y: mm(9), w: A4.w - mm(16), h: mm(44) }, { minSize: 70, maxLines: 1 });
  // The head in front of the masthead, down to where the top shade ends (no seam on the face).
  if (photo && portrait?.depth) c.cutout(page, photo, cutoutBand('vogue'), portrait.crop);
  // The issue line runs over everything, the head included, like on a newsstand cover.
  const strip = { x: MARGIN, y: mm(50), w: CONTENT.w, h: mm(5) };
  c.fit(page, issueLine(issue), { ...s.folio, color: t.onPhoto, size: 7.5 }, strip, { minSize: 5, maxLines: 1 });
  c.fit(page, PRICE, { ...s.folio, color: t.onPhoto, size: 7.5, align: 'right' }, strip, { minSize: 5, maxLines: 1 });

  let y = mm(78);
  lines.slice(0, 4).forEach((line, i) => {
    const box = { x: MARGIN, y, w: column, h: mm(24) };
    if (i === 0) {
      c.rect(page, { x: MARGIN, y: y - mm(1), w: mm(26), h: mm(5.5) }, t.accent);
      c.fit(page, 'Эксклюзив', { font: t.fonts.sansBold, size: 7, leading: 1, color: t.onAccent, align: 'center', tracking: 1.6, uppercase: true }, { x: MARGIN, y: y + mm(0.4), w: mm(26), h: mm(4) }, { minSize: 5, maxLines: 1 });
      y += mm(8);
      box.y = y;
    }
    const used = c.fit(page, line.title, { font: t.fonts.display, size: i === 0 ? 24 : 18, leading: 1.02, color: t.onPhoto }, box, { minSize: 12, maxLines: 2 });
    const textUsed = c.fit(page, line.text, { font: t.fonts.sansSemi, size: 8.5, leading: 1.3, color: t.onPhoto }, { ...box, y: y + used + mm(1.2), h: mm(10) }, { minSize: 7, maxLines: 2 });
    c.rect(page, { x: MARGIN, y: y + used + textUsed + mm(3.5), w: mm(10), h: 1.4 }, t.accent);
    y += used + textUsed + mm(9);
  });

  c.fit(page, issue.hero, { font: t.fonts.displayItalic, size: 120, leading: 0.9, color: t.onPhoto }, { x: MARGIN, y: A4.h - mm(74), w: CONTENT.w - mm(34), h: mm(50) }, { minSize: 40, maxLines: 2, verticalAlign: 'bottom' });
  c.fit(page, tagline, { font: t.fonts.sansSemi, size: 8.5, leading: 1.3, color: t.onPhoto, tracking: 0.6 }, { x: MARGIN, y: A4.h - mm(20), w: mm(130), h: mm(6) }, { minSize: 6, maxLines: 1 });
  barcode(c, s, page, { x: A4.w - MARGIN - mm(28), y: A4.h - mm(34), w: mm(28), h: mm(18) }, issue.hero, t.onPhoto);
}

function tabloidCover(c: Composer, s: Styles, issue: Issue, photo: PhotoRef | undefined, lines: CoverLine[], tagline: string) {
  const t = s.t;
  const YELLOW = t.soft;
  const page = c.addPage('cover', A4, photo ? t.shadow : YELLOW);
  const portrait = placePortrait(photo, 'tabloid');
  const column = linesWidth(portrait, mm(92), mm(58));
  if (photo) {
    c.image(page, photo, FULL_BLEED, portrait ? { crop: portrait.crop } : { focusY: 0.2 });
    shade(c, s, page, A4.h - mm(120), A4.h + BLEED, 0.75, 'up');
    sideShade(c, s, page, MARGIN + column + mm(30), 0.5);
  }
  // Masthead band and the yellow issue strip.
  c.rect(page, { x: -BLEED, y: -BLEED, w: FULL_BLEED.w, h: mm(46) + BLEED }, t.accent);
  c.fit(page, t.masthead, { font: t.fonts.masthead, size: 120, leading: 0.9, color: t.onAccent, align: 'center' }, { x: mm(8), y: mm(8), w: A4.w - mm(16), h: mm(34) }, { minSize: 50, maxLines: 1 });
  c.rect(page, { x: -BLEED, y: mm(46), w: FULL_BLEED.w, h: mm(8) }, YELLOW);
  const strip = { x: MARGIN, y: mm(48.2), w: CONTENT.w, h: mm(4) };
  c.fit(page, issueLine(issue), { ...s.folio, color: t.ink, size: 7.5 }, strip, { minSize: 5, maxLines: 1 });
  c.fit(page, PRICE, { ...s.folio, color: t.ink, size: 7.5, align: 'right' }, strip, { minSize: 5, maxLines: 1 });
  // The head bursts out of the red band, cut out like a sticker with a white edge.
  if (photo && portrait?.depth) c.cutout(page, photo, cutoutBand('tabloid'), portrait.crop, { outline: { color: '#ffffff', width: 2.4 } });

  // Shouting cover lines: yellow capitals on black bars, sized to the words.
  let y = mm(66);
  lines.slice(0, 4).forEach((line, i) => {
    const size = i === 0 ? 30 : 21;
    const title = line.title.toLocaleUpperCase('ru-RU');
    // Bars hug the words and never reach the face.
    const width = Math.min(column, c.metrics.width(t.fonts.display, title, size) + mm(6));
    // The bar's height depends on how the title sets, so it is inserted under the text afterwards.
    const barIndex = page.elements.length;
    const used = c.fit(page, title, { font: t.fonts.display, size, leading: 1.02, color: YELLOW }, { x: MARGIN + mm(3), y: y + mm(1.5), w: width - mm(4), h: mm(26) }, { minSize: 13, maxLines: 2 });
    page.elements.splice(barIndex, 0, { type: 'rect', box: { x: MARGIN, y, w: width, h: used + mm(3) }, fill: '#000000' });
    const textUsed = c.fit(page, line.text, { font: t.fonts.sansBold, size: 9, leading: 1.25, color: t.onPhoto }, { x: MARGIN, y: y + used + mm(4.5), w: Math.min(mm(80), column), h: mm(10) }, { minSize: 7, maxLines: 2 });
    y += used + textUsed + mm(10);
  });

  // The burst: a yellow star with a red word, like a supermarket tabloid. Never on the face: below
  // the head when there is room above the name, otherwise left out.
  const cx = A4.w - MARGIN - mm(22);
  const radius = mm(24);
  let cy: number | undefined = mm(86);
  if (portrait) {
    const { head } = portrait;
    const overlapsX = cx + radius > head.x && cx - radius < head.x + head.w;
    cy = overlapsX ? Math.max(mm(86), head.y + head.h + radius + mm(4)) : mm(86);
    if (cy + radius > A4.h - mm(84)) cy = undefined;
  }
  if (cy !== undefined) {
    page.elements.push({ type: 'path', d: burst(cx, cy, radius, mm(19), 18), fill: YELLOW });
    c.fit(page, 'Сенсация!', { font: t.fonts.display, size: 17, leading: 1, color: t.accent, align: 'center', uppercase: true }, { x: cx - mm(18), y: cy - mm(6), w: mm(36), h: mm(8) }, { minSize: 10, maxLines: 1 });
    c.fit(page, 'Все тайны раскрыты', { font: t.fonts.sansBold, size: 7.5, leading: 1.15, color: t.ink, align: 'center' }, { x: cx - mm(16), y: cy + mm(2.5), w: mm(32), h: mm(8) }, { minSize: 5.5, maxLines: 2 });
  }

  const name = issue.hero.toLocaleUpperCase('ru-RU');
  c.fit(page, name, { font: t.fonts.masthead, size: 110, leading: 0.92, color: t.onPhoto }, { x: MARGIN, y: A4.h - mm(80), w: CONTENT.w - mm(32), h: mm(54) }, { minSize: 36, maxLines: 2, verticalAlign: 'bottom' });
  c.rect(page, { x: MARGIN, y: A4.h - mm(23), w: mm(130), h: mm(7) }, t.accent);
  c.fit(page, tagline, { font: t.fonts.sansBold, size: 8.5, leading: 1, color: t.onAccent, uppercase: true, tracking: 0.8 }, { x: MARGIN + mm(2.5), y: A4.h - mm(21), w: mm(126), h: mm(4) }, { minSize: 5.5, maxLines: 1 });
  c.rect(page, { x: A4.w - MARGIN - mm(30), y: A4.h - mm(37), w: mm(30), h: mm(22) }, '#ffffff');
  barcode(c, s, page, { x: A4.w - MARGIN - mm(28), y: A4.h - mm(35), w: mm(26), h: mm(18) }, issue.hero, '#000000');
}

function airyCover(c: Composer, s: Styles, issue: Issue, photo: PhotoRef | undefined, lines: CoverLine[], tagline: string) {
  const t = s.t;
  const page = c.addPage('cover', A4, t.paper);
  c.fit(page, t.masthead, { font: t.fonts.masthead, size: 150, leading: 0.85, color: t.ink, align: 'center' }, { x: mm(10), y: mm(8), w: A4.w - mm(20), h: mm(44) }, { minSize: 70, maxLines: 1 });
  const strip = { x: mm(22), y: mm(52), w: A4.w - mm(44), h: mm(5) };
  c.fit(page, issueLine(issue), { ...s.folio, color: t.muted, size: 7 }, strip, { minSize: 5, maxLines: 1 });
  c.fit(page, PRICE, { ...s.folio, color: t.muted, size: 7, align: 'right' }, strip, { minSize: 5, maxLines: 1 });

  // The portrait as a print on the page, with a hairline frame offset like a passe-partout.
  const box = COVER_ME_HEADS.tender.frame;
  // A quiet print: the face placed in the frame, nothing breaking out of it.
  const portrait = placePortrait(photo, 'tender');
  if (photo) {
    c.image(page, photo, box, portrait ? { crop: portrait.crop } : { focusY: 0.25 });
    shade(c, s, page, box.y + box.h - mm(60), box.y + box.h, 0.5, 'up');
    // The shade spans the bleed; mask its sides back to paper.
    c.rect(page, { x: -BLEED, y: box.y + box.h - mm(60), w: box.x + BLEED, h: mm(60) }, t.paper);
    c.rect(page, { x: box.x + box.w, y: box.y + box.h - mm(60), w: A4.w - box.x - box.w + BLEED, h: mm(60) }, t.paper);
  } else c.rect(page, box, t.soft);
  c.rect(page, { x: box.x - mm(4), y: box.y - mm(4), w: box.w + mm(8), h: box.h + mm(8) }, undefined, { stroke: { color: t.accent, width: 0.6 } });

  // Two delicate cover lines inside the photo, bottom-left.
  let y = box.y + box.h - mm(38);
  for (const line of lines.slice(0, 2)) {
    const used = c.fit(page, line.title, { font: t.fonts.displayItalic, size: 19, leading: 1.05, color: t.onPhoto }, { x: box.x + mm(8), y, w: mm(90), h: mm(12) }, { minSize: 11, maxLines: 1 });
    c.fit(page, line.text, { font: t.fonts.sans, size: 7.8, leading: 1.3, color: t.onPhoto }, { x: box.x + mm(8), y: y + used + mm(0.5), w: mm(90), h: mm(8) }, { minSize: 6, maxLines: 1 });
    y += used + mm(13);
  }

  c.fit(page, issue.hero, { font: t.fonts.displayItalic, size: 64, leading: 0.95, color: t.accent, align: 'center' }, { x: mm(16), y: box.y + box.h + mm(7), w: A4.w - mm(32), h: mm(26) }, { minSize: 28, maxLines: 1 });
  c.fit(page, tagline, { font: t.fonts.serifItalic, size: 13, leading: 1.2, color: t.muted, align: 'center' }, { x: mm(16), y: A4.h - mm(17), w: A4.w - mm(32), h: mm(7) }, { minSize: 8, maxLines: 1 });
}

function noirCover(c: Composer, s: Styles, issue: Issue, photo: PhotoRef | undefined, lines: CoverLine[], tagline: string) {
  const t = s.t;
  const page = c.addPage('cover', A4, t.paper);
  const portrait = placePortrait(photo, 'noir');
  const column = linesWidth(portrait, mm(62), mm(50));
  if (photo) {
    c.image(page, photo, FULL_BLEED, portrait ? { crop: portrait.crop } : { focusY: 0.25 });
    // Film-like: deep shade at both ends and under the credits, the face left in its own light.
    shade(c, s, page, -BLEED, mm(80), 0.62, 'down');
    shade(c, s, page, A4.h - mm(120), A4.h + BLEED, 0.85, 'up');
    sideShade(c, s, page, mm(16) + column + mm(30), 0.5);
  }
  // A gold hairline frame around the trimmed page.
  c.rect(page, { x: mm(7), y: mm(7), w: A4.w - mm(14), h: A4.h - mm(14) }, undefined, { stroke: { color: t.accent, width: 0.7 } });
  c.fit(page, t.masthead, { font: t.fonts.masthead, size: 72, leading: 1, color: t.onPhoto, align: 'center', tracking: t.mastheadTracking }, { x: mm(14), y: mm(16), w: A4.w - mm(28), h: mm(26) }, { minSize: 36, maxLines: 1 });
  // In front of the masthead and the gold frame.
  if (photo && portrait?.depth) c.cutout(page, photo, cutoutBand('noir'), portrait.crop);
  c.fit(page, issueLine(issue), { ...s.folio, color: t.accent, size: 7, align: 'center', tracking: 3 }, { x: mm(14), y: mm(42), w: A4.w - mm(28), h: mm(5) }, { minSize: 5, maxLines: 1 });

  // Cover lines as film credits down the left edge, clear of the face.
  let y = mm(64);
  for (const line of lines.slice(0, 3)) {
    const used = c.fit(page, line.title.toLocaleUpperCase('ru-RU'), { font: t.fonts.display, size: 14, leading: 1.15, color: t.onPhoto, tracking: 2.2 }, { x: mm(16), y, w: column, h: mm(14) }, { minSize: 9, maxLines: 2 });
    c.fit(page, line.text, { font: t.fonts.serifItalic, size: 11, leading: 1.25, color: t.accent }, { x: mm(16), y: y + used + mm(1), w: column, h: mm(9) }, { minSize: 8, maxLines: 2 });
    c.line(page, { x: mm(16), y: y + used + mm(12) }, { x: mm(24), y: y + used + mm(12) }, t.accent, 0.6);
    y += used + mm(19);
  }

  c.fit(page, issue.hero, { font: t.fonts.displayItalic, size: 120, leading: 0.9, color: t.accent }, { x: mm(16), y: A4.h - mm(84), w: A4.w - mm(32), h: mm(50) }, { minSize: 40, maxLines: 2, verticalAlign: 'bottom' });
  c.fit(page, tagline.toLocaleUpperCase('ru-RU'), { font: t.fonts.sansSemi, size: 7.5, leading: 1.2, color: t.onPhoto, tracking: 2.6 }, { x: mm(16), y: A4.h - mm(27), w: mm(140), h: mm(5) }, { minSize: 5, maxLines: 1 });
  barcode(c, s, page, { x: A4.w - mm(16) - mm(24), y: A4.h - mm(36), w: mm(24), h: mm(15) }, issue.hero, t.onPhoto);
}

/** Star burst path: `points` spikes between two radii. */
function burst(cx: number, cy: number, outer: number, inner: number, points: number): string {
  const parts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    parts.push(`${i === 0 ? 'M' : 'L'}${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `${parts.join(' ')} Z`;
}

/** Back cover: the hero's catchphrase as the last word of the issue. */
export function backCover(c: Composer, s: Styles, issue: Issue, phrase: string, closing: string | undefined, issueUrl?: string) {
  const t = s.t;
  const page = c.addPage('back', A4, t.dark);
  const text = phrase || (!issue.templateDraft && closing) || 'Продолжение следует';
  if (t.cover === 'noir') c.rect(page, { x: mm(7), y: mm(7), w: A4.w - mm(14), h: A4.h - mm(14) }, undefined, { stroke: { color: t.accent, width: 0.7 } });
  c.fit(page, 'Коронная фраза', { ...s.kicker, color: t.darkAccent }, { x: MARGIN, y: mm(60), w: CONTENT.w, h: mm(5) }, { minSize: 6, maxLines: 1 });
  const quoteFont = t.headlineUppercase && t.cover === 'tabloid' ? t.fonts.masthead : t.fonts.displayItalic;
  const used = c.fit(page, phrase ? `«${phrase.replace(/^[«"]|[»"]$/g, '')}»` : text, { font: quoteFont, size: 64, leading: 1.05, color: t.onDark, uppercase: t.cover === 'tabloid' }, { x: MARGIN, y: mm(70), w: CONTENT.w, h: mm(120) }, { minSize: 26, maxLines: 5 });
  if (phrase) c.fit(page, `— ${issue.hero}`, { ...s.deck, color: t.darkAccent, size: 18 }, { x: MARGIN, y: mm(76) + used, w: CONTENT.w, h: mm(10) }, { minSize: 10, maxLines: 1 });
  c.fit(page, t.masthead, { font: t.fonts.masthead, size: 30, leading: 1, color: t.onDark, tracking: Math.min(t.mastheadTracking, 4) }, { x: MARGIN, y: A4.h - mm(40), w: mm(100), h: mm(12) }, { minSize: 16, maxLines: 1 });
  c.fit(page, 'Сделано с любовью · coverme.kz', { ...s.folio, color: t.darkAccent }, { x: MARGIN, y: A4.h - mm(25), w: mm(100), h: mm(4) }, { minSize: 5, maxLines: 1 });
  if (!issueUrl) {
    c.rect(page, { x: A4.w - MARGIN - mm(32), y: A4.h - mm(46), w: mm(32), h: mm(26) }, '#ffffff');
    barcode(c, s, page, { x: A4.w - MARGIN - mm(29), y: A4.h - mm(43), w: mm(26), h: mm(16) }, issue.hero, '#000000');
    return;
  }
  // The online issue: guests scan it at the party, leaf through, and can order one of their own.
  const box = { x: A4.w - MARGIN - mm(34), y: A4.h - mm(56), w: mm(34), h: mm(34) };
  c.rect(page, box, '#ffffff');
  c.qr(page, { x: box.x + mm(3), y: box.y + mm(3), w: box.w - mm(6), h: box.h - mm(6) }, issueUrl, '#000000');
  const caption = { x: box.x - mm(62), y: box.y + mm(9), w: mm(56), h: mm(20) };
  const titleUsed = c.fit(page, 'Листайте номер онлайн', { font: t.fonts.sansBold, size: 9, leading: 1.2, color: t.onDark, align: 'right' }, caption, { minSize: 7, maxLines: 1 });
  c.fit(page, 'Наведите камеру — и соберите такой же для своего человека', { ...s.folio, color: t.darkAccent, align: 'right', leading: 1.5 }, { ...caption, y: caption.y + titleUsed + mm(1.5), h: mm(10) }, { minSize: 5, maxLines: 2 });
}
