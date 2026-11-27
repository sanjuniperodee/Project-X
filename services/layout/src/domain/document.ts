/**
 * Layout document model: what goes where on every page, in PDF points (1/72 inch),
 * origin at the top-left corner of the trimmed page. Both renderers (print PDF and
 * SVG previews) draw from this model, so the preview is exactly what gets printed.
 */

export const MM = 72 / 25.4;
export const mm = (value: number) => value * MM;
export const toMm = (points: number) => Math.round((points / MM) * 10) / 10;

/** Bleed around every trimmed page: backgrounds and full-bleed photos extend into it. */
export const BLEED = mm(3);

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

export const A4: Size = { w: mm(210), h: mm(297) };

/** Logical font slot of a theme, e.g. "display" or "body-italic"; resolved by the font library. */
export type FontKey = string;

export interface TextStyle {
  font: FontKey;
  size: number;
  /** Line height as a multiple of the size. */
  leading: number;
  color: string;
  align?: 'left' | 'center' | 'right' | 'justify';
  /** Extra space between letters, in points. */
  tracking?: number;
  uppercase?: boolean;
  /** Extra space before each paragraph, in points. */
  paragraphSpacing?: number;
}

/** A word (or part of a word set in a fallback font) placed on a line. */
export interface Piece {
  text: string;
  font: FontKey;
  /** Offset from the line start. */
  x: number;
  width: number;
}

export interface Line {
  pieces: Piece[];
  /** Offset of the baseline from the top of the line box. */
  ascent: number;
  height: number;
  width: number;
  style: TextStyle;
  /** Space reserved above the line (paragraph spacing). */
  spaceBefore: number;
  /** Keep this line in the same frame as the next one (headings). */
  keepWithNext: boolean;
}

export interface TextElement {
  type: 'text';
  /** Top-left of the first line box. */
  x: number;
  y: number;
  lines: Array<Line & { y: number }>;
}

export interface PhotoRef {
  /** Media file name, e.g. "3f2a….jpg". */
  key: string;
  /** Oriented pixel size. */
  width: number;
  height: number;
  /** Most characteristic vivid colour of the photo (hex), when it has one. */
  vivid?: string;
}

export interface ImageElement {
  type: 'image';
  photo: PhotoRef;
  box: Box;
  shape?: 'rect' | 'circle';
  /** Vertical focus for cropping: 0 top … 1 bottom. Portraits keep faces near the top third. */
  focusY?: number;
  /** Optional thin frame drawn on top. */
  stroke?: { color: string; width: number };
}

export interface RectElement {
  type: 'rect';
  box: Box;
  fill?: string;
  stroke?: { color: string; width: number; dash?: number[] };
  radius?: number;
  opacity?: number;
  /** Vertical gradient fill (top → bottom) instead of `fill`: stops as [offset 0…1, opacity 0…1]. */
  gradient?: { color: string; stops: Array<[number, number]> };
}

export interface LineElement {
  type: 'line';
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  width: number;
  dash?: number[];
}

export interface EllipseElement {
  type: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill?: string;
  stroke?: { color: string; width: number };
}

/** SVG path data in page coordinates (ornaments, arrows). */
export interface PathElement {
  type: 'path';
  d: string;
  fill?: string;
  stroke?: { color: string; width: number };
}

export type Element = TextElement | ImageElement | RectElement | LineElement | EllipseElement | PathElement;

export interface Page {
  /** Shown in the page list: cover, article, friends, photos, tree, chapter, cards, board… */
  kind: string;
  size: Size;
  /** Background colour, extended into the bleed. */
  background?: string;
  /** Crop marks for imposed sheets (cards), drawn outside the trim area. */
  cropMarks?: Box[];
  elements: Element[];
}

export interface LayoutDocument {
  title: string;
  /** Template id and revision, e.g. "glossy-magazine@1". */
  template: string;
  pages: Page[];
  warnings: string[];
}

/**
 * Cover-fit crop of a photo into a box: the photo fills the box and the overflow is cut.
 * Shared by both renderers so the crop is identical in the PDF and the preview.
 */
export function coverCrop(photo: Pick<PhotoRef, 'width' | 'height'>, box: Box, focusY = 0.5): Box {
  const scale = Math.max(box.w / photo.width, box.h / photo.height);
  const w = photo.width * scale;
  const h = photo.height * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) * focusY, w, h };
}

export function inset(box: Box, dx: number, dy = dx): Box {
  return { x: box.x + dx, y: box.y + dy, w: box.w - 2 * dx, h: box.h - 2 * dy };
}

/** Cut-line marks for imposed sheets: short segments outside the cards, as [x1, y1, x2, y2]. */
export function cropMarkLines(page: Page): Array<[number, number, number, number]> {
  if (!page.cropMarks?.length) return [];
  const length = 12;
  const offset = 3;
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const box of page.cropMarks) {
    xs.add(box.x).add(box.x + box.w);
    ys.add(box.y).add(box.y + box.h);
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const out: Array<[number, number, number, number]> = [];
  for (const x of xs) out.push([x, minY - offset - length, x, minY - offset], [x, maxY + offset, x, maxY + offset + length]);
  for (const y of ys) out.push([minX - offset - length, y, minX - offset, y], [maxX + offset, y, maxX + offset + length, y]);
  return out;
}
