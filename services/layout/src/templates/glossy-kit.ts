import type { DraftArt, MagazineRubric } from '@px/contracts';
import { A4, BLEED, mm, type Box, type Page, type TextStyle } from '../domain/document';
import type { GlossyTheme } from './glossy-themes';
import type { Composer } from './template';

/** Page geometry and shared building blocks of the Cover Me templates. */

export const MARGIN = mm(15);
export const TOP = mm(18);
export const BOTTOM = mm(18);
export const GUTTER = mm(6);
export const CONTENT: Box = { x: MARGIN, y: TOP, w: A4.w - 2 * MARGIN, h: A4.h - TOP - BOTTOM };
export const FULL_BLEED: Box = { x: -BLEED, y: -BLEED, w: A4.w + 2 * BLEED, h: A4.h + 2 * BLEED };

/** Everything a page builder needs to know about the issue being set. */
export interface Issue {
  hero: string;
  occasion: string;
  eventDate: string;
  /** "Декабрь 2026" */
  month: string;
  templateDraft: boolean;
  art: DraftArt | undefined;
}

export type Styles = ReturnType<typeof styles>;

/** Type styles of one theme; `scale` shrinks running text when an issue is long. */
export function styles(t: GlossyTheme, scale: number) {
  const f = t.fonts;
  const body: TextStyle = { font: f.sans, size: 9.4 * scale, leading: 1.5, color: t.ink, align: 'left', paragraphSpacing: 4.5 * scale };
  // Thin serifs (Cormorant) read smaller than Playfair at the same size.
  const serifBoost = f.serif.startsWith('cormorant') ? 1.18 : 1;
  return {
    t,
    body,
    lede: { font: f.serif, size: 13 * scale * serifBoost, leading: 1.42, color: t.ink, paragraphSpacing: 6 } satisfies TextStyle,
    question: { font: f.sansBold, size: 9.4 * scale, leading: 1.4, color: t.accent } satisfies TextStyle,
    kicker: { font: f.sansBold, size: 7.5, leading: 1.2, color: t.accent, tracking: 1.8, uppercase: true } satisfies TextStyle,
    headline: {
      font: f.display,
      size: 54,
      leading: t.headlineUppercase ? 1 : 0.98,
      color: t.ink,
      uppercase: t.headlineUppercase,
      tracking: t.headlineTracking,
    } satisfies TextStyle,
    deck: { font: f.serifItalic, size: 15 * serifBoost, leading: 1.3, color: t.ink } satisfies TextStyle,
    pull: { font: f.serifItalic, size: 20 * serifBoost, leading: 1.22, color: t.accent } satisfies TextStyle,
    label: { font: f.sansBold, size: 7, leading: 1.3, color: t.muted, tracking: 1.4, uppercase: true } satisfies TextStyle,
    value: { font: f.serifBold, size: 14 * serifBoost, leading: 1.25, color: t.ink } satisfies TextStyle,
    author: { font: f.serifBold, size: 15 * scale * serifBoost, leading: 1.15, color: t.ink } satisfies TextStyle,
    wish: { font: f.serifItalic, size: 11.5 * scale * serifBoost, leading: 1.4, color: t.accent } satisfies TextStyle,
    folio: { font: f.sansSemi, size: 6.5, leading: 1, color: t.muted, tracking: 1.4, uppercase: true } satisfies TextStyle,
  };
}

/**
 * Rubric label. Plain accent text in most styles; the tabloid sets it as white
 * capitals on an accent bar, sized to the text.
 */
export function kicker(c: Composer, s: Styles, page: Page, text: string, box: Box, color?: string) {
  if (s.t.kicker === 'bar') {
    const style = { ...s.kicker, size: 8 };
    const upper = text.toLocaleUpperCase('ru-RU');
    const width = c.metrics.width(style.font, upper, style.size) + (style.tracking ?? 0) * upper.length + mm(4);
    const w = Math.min(box.w, width);
    const x = box.x;
    c.rect(page, { x, y: box.y - mm(1.2), w, h: mm(5.6) }, color ?? s.t.accent);
    c.fit(page, text, { ...style, color: s.t.onAccent }, { x: x + mm(2), y: box.y + mm(0.1), w: w - mm(3), h: mm(4) }, { minSize: 5, maxLines: 1 });
    return;
  }
  c.fit(page, text, { ...s.kicker, ...(color ? { color } : {}) }, box, { minSize: 6, maxLines: 1 });
}

/**
 * Title and deck of a rubric: the AI art direction's personal wording when there is one,
 * otherwise the template's own.
 */
export function rubric(issue: Issue, id: MagazineRubric, fallback: { title: string; deck?: string }): { title: string; deck: string } {
  const own = issue.art?.rubrics.find((r) => r.rubric === id);
  return {
    title: own?.title.trim() || fallback.title,
    deck: own?.deck.trim() || fallback.deck || '',
  };
}

/** Soft gradient over a photo for legible type. `up` is darkest at the bottom. */
export function shade(c: Composer, s: Styles, page: Page, from: number, to: number, max: number, direction: 'up' | 'down') {
  // Ease-in stops, so the gradient has no visible start edge.
  const stops: Array<[number, number]> = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const strength = direction === 'up' ? t : 1 - t;
    return [t, Math.round(max * strength * strength * 1000) / 1000];
  });
  c.rect(page, { x: -BLEED, y: from, w: A4.w + 2 * BLEED, h: to - from }, undefined, { gradient: { color: s.t.shadow, stops } });
}

/** Darkens the photo from the left edge to `width`, under cover lines, fading out to the right. */
export function sideShade(c: Composer, s: Styles, page: Page, width: number, max: number) {
  const stops: Array<[number, number]> = [0, 0.35, 0.7, 1].map((t) => [t, Math.round(max * (1 - t) ** 1.6 * 1000) / 1000]);
  c.rect(page, { x: -BLEED, y: -BLEED, w: width + BLEED, h: A4.h + 2 * BLEED }, undefined, { gradient: { color: s.t.shadow, stops, horizontal: true } });
}

export function folio(c: Composer, s: Styles, page: Page, issue: Issue | undefined, number = c.pages.indexOf(page) + 1, color = s.t.muted) {
  const even = number % 2 === 0;
  const text = ['Cover Me', issue?.month].filter(Boolean).join('  ·  ');
  const box = { x: MARGIN, y: A4.h - mm(11), w: CONTENT.w, h: mm(4) };
  c.fit(page, even ? `${number}     ${text}` : `${text}     ${number}`, { ...s.folio, color, align: even ? 'left' : 'right' }, box, { minSize: 5, maxLines: 1 });
}

/** Decorative EAN-like barcode derived from the hero's name (not a scannable code). */
export function barcode(c: Composer, s: Styles, page: Page, box: Box, seed: string, color: string) {
  let hash = 2166136261;
  for (const ch of seed) hash = Math.imul(hash ^ ch.codePointAt(0)!, 16777619) >>> 0;
  const unit = box.w / 95;
  let x = box.x;
  const barsH = box.h - mm(4);
  for (let i = 0; i < 95 && x < box.x + box.w; i++) {
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
    const guard = i < 3 || i > 91 || (i > 45 && i < 49);
    const on = guard ? i % 2 === 0 : (hash & 3) !== 0;
    const width = unit * (guard ? 1 : 1 + (hash % 2));
    if (on) c.rect(page, { x, y: box.y, w: width * 0.9, h: guard ? barsH + mm(1.5) : barsH }, color);
    x += width;
  }
  c.fit(page, `4 607${String(hash % 1_000_000).padStart(6, '0')} 01`, { font: s.t.fonts.sansSemi, size: 6.5, leading: 1, color, align: 'center', tracking: 1 }, { x: box.x, y: box.y + barsH + mm(1.2), w: box.w, h: mm(3) }, { minSize: 4, maxLines: 1 });
}

export function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
