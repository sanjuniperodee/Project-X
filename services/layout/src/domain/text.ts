import type { Box, FontKey, Line, Piece, TextElement, TextStyle } from './document';

/**
 * Font measurements the typesetter needs. Implemented over fontkit in infrastructure;
 * tests can use a fixed-width fake. All values are in points for the given size.
 */
export interface FontMetrics {
  /** Advance width of the text set in the font (kerning included). */
  width(font: FontKey, text: string, size: number): number;
  /** Whether the font has a glyph for the code point; otherwise the fallback font is used. */
  covers(font: FontKey, codePoint: number): boolean;
  /** Fallback font for missing glyphs (e.g. Kazakh letters in a Latin/Cyrillic display face). */
  fallback(font: FontKey): FontKey | null;
  ascent(font: FontKey, size: number): number;
  /** Depth below the baseline, as a positive number. */
  descent(font: FontKey, size: number): number;
}

/** A paragraph-level unit of text with its own style. */
export interface Flowable {
  text: string;
  style: TextStyle;
  spaceBefore?: number;
  /** Headings: never left alone at the bottom of a frame. */
  keepWithNext?: boolean;
}

/** Splits a word into runs of the primary font and its fallback, glyph by glyph. */
function fontRuns(metrics: FontMetrics, font: FontKey, text: string): Array<{ font: FontKey; text: string }> {
  const fallback = metrics.fallback(font);
  if (!fallback) return [{ font, text }];
  const runs: Array<{ font: FontKey; text: string }> = [];
  for (const char of text) {
    const chosen = metrics.covers(font, char.codePointAt(0)!) ? font : fallback;
    const last = runs.at(-1);
    if (last && last.font === chosen) last.text += char;
    else runs.push({ font: chosen, text: char });
  }
  return runs;
}

interface Word {
  pieces: Array<{ font: FontKey; text: string; width: number }>;
  width: number;
}

function measureWord(metrics: FontMetrics, style: TextStyle, text: string): Word {
  const tracking = style.tracking ?? 0;
  const pieces = fontRuns(metrics, style.font, text).map((run) => ({
    ...run,
    width: metrics.width(run.font, run.text, style.size) + tracking * [...run.text].length,
  }));
  return { pieces, width: pieces.reduce((sum, p) => sum + p.width, 0) };
}

/** Breaks a word that is wider than the line into chunks that fit. */
function splitLongWord(metrics: FontMetrics, style: TextStyle, text: string, maxWidth: number): Word[] {
  const chars = [...text];
  const words: Word[] = [];
  let current = '';
  for (const char of chars) {
    const candidate = current + char;
    if (current && measureWord(metrics, style, candidate).width > maxWidth) {
      words.push(measureWord(metrics, style, current));
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) words.push(measureWord(metrics, style, current));
  return words;
}

function buildLine(
  words: Word[],
  spaceWidth: number,
  style: TextStyle,
  width: number,
  metrics: FontMetrics,
  last: boolean,
): Line {
  const natural = words.reduce((sum, w) => sum + w.width, 0) + spaceWidth * Math.max(0, words.length - 1);
  const align = style.align ?? 'left';
  let gap = spaceWidth;
  let offset = 0;
  const stretch = words.length > 1 ? (width - natural) / (words.length - 1) : 0;
  // A line with a few long words would get holes: such lines stay ragged instead.
  const justify = align === 'justify' && !last && words.length > 1 && stretch <= spaceWidth * 2.5;
  if (justify) {
    gap = spaceWidth + stretch;
  } else if (align === 'center') {
    offset = (width - natural) / 2;
  } else if (align === 'right') {
    offset = width - natural;
  }

  const pieces: Piece[] = [];
  let x = offset;
  for (const word of words) {
    for (const piece of word.pieces) {
      pieces.push({ text: piece.text, font: piece.font, x, width: piece.width });
      x += piece.width;
    }
    x += gap;
  }
  // CSS-like half-leading: the glyph box is centred in the line box.
  const height = style.size * style.leading;
  const ascent = metrics.ascent(style.font, style.size);
  const descent = metrics.descent(style.font, style.size);
  return {
    pieces,
    ascent: (height - ascent - descent) / 2 + ascent,
    height,
    width: justify ? width : natural,
    style,
    spaceBefore: 0,
    keepWithNext: false,
  };
}

/** Typesets one paragraph style over a width: greedy line breaking, justification, glyph fallback. */
export function typeset(metrics: FontMetrics, text: string, style: TextStyle, width: number): Line[] {
  const source = style.uppercase ? text.toLocaleUpperCase('ru-RU') : text;
  const spaceWidth = metrics.width(style.font, ' ', style.size) + (style.tracking ?? 0);
  const lines: Line[] = [];

  const paragraphs = source.replace(/\r\n?/g, '\n').split('\n');
  paragraphs.forEach((paragraph, index) => {
    const tokens = paragraph.split(/[ \t]+/).filter(Boolean);
    if (tokens.length === 0) return;
    const words = tokens.flatMap((token) => {
      const word = measureWord(metrics, style, token);
      return word.width > width ? splitLongWord(metrics, style, token, width) : [word];
    });

    let current: Word[] = [];
    let currentWidth = 0;
    const paragraphLines: Line[] = [];
    for (const word of words) {
      const needed = current.length === 0 ? word.width : currentWidth + spaceWidth + word.width;
      if (current.length > 0 && needed > width + 0.01) {
        paragraphLines.push(buildLine(current, spaceWidth, style, width, metrics, false));
        current = [word];
        currentWidth = word.width;
      } else {
        current.push(word);
        currentWidth = needed;
      }
    }
    if (current.length > 0) paragraphLines.push(buildLine(current, spaceWidth, style, width, metrics, true));

    if (paragraphLines[0] && index > 0 && lines.length > 0) paragraphLines[0].spaceBefore = style.paragraphSpacing ?? 0;
    lines.push(...paragraphLines);
  });
  return lines;
}

export function typesetFlowables(metrics: FontMetrics, flowables: Flowable[], width: number): Line[] {
  const lines: Line[] = [];
  for (const flowable of flowables) {
    const set = typeset(metrics, flowable.text, flowable.style, width);
    if (set.length === 0) continue;
    if (lines.length > 0) set[0]!.spaceBefore += flowable.spaceBefore ?? flowable.style.paragraphSpacing ?? 0;
    if (flowable.keepWithNext) for (const line of set) line.keepWithNext = true;
    lines.push(...set);
  }
  return lines;
}

export function linesHeight(lines: Line[]): number {
  return lines.reduce((sum, line, i) => sum + line.height + (i > 0 ? line.spaceBefore : 0), 0);
}

/** Places lines into a frame from the top; returns the element and the lines that did not fit. */
export function placeLines(lines: Line[], frame: Box): { element: TextElement | null; rest: Line[]; used: number } {
  const placed: Array<Line & { y: number }> = [];
  let y = 0;
  let index = 0;
  for (; index < lines.length; index++) {
    const line = lines[index]!;
    const before = placed.length > 0 ? line.spaceBefore : 0;
    if (y + before + line.height > frame.h + 0.01) break;
    placed.push({ ...line, y: y + before });
    y += before + line.height;
  }
  // Do not strand a heading at the bottom of the frame.
  if (index < lines.length) {
    while (placed.length > 0 && placed.at(-1)!.keepWithNext) {
      placed.pop();
      index--;
    }
    if (placed.length > 0) y = placed.at(-1)!.y + placed.at(-1)!.height;
  }
  return {
    element: placed.length > 0 ? { type: 'text', x: frame.x, y: frame.y, lines: placed } : null,
    rest: lines.slice(index),
    used: placed.length > 0 ? y : 0,
  };
}

/** Text that flows across frames (columns, then pages). */
export class Story {
  private lines: Line[];

  constructor(metrics: FontMetrics, flowables: Flowable[], width: number) {
    this.lines = typesetFlowables(metrics, flowables, width);
  }

  get done(): boolean {
    return this.lines.length === 0;
  }

  get firstLineHeight(): number {
    return this.lines[0]?.height ?? 0;
  }

  get lineCount(): number {
    return this.lines.length;
  }

  get remainingHeight(): number {
    return linesHeight(this.lines);
  }

  /** Fills the frames in order; returns the placed text elements and the height used in the last frame. */
  fill(frames: Box[]): { elements: TextElement[]; lastUsed: number } {
    const elements: TextElement[] = [];
    let lastUsed = 0;
    for (const frame of frames) {
      if (this.done) break;
      const { element, rest, used } = placeLines(this.lines, frame);
      if (!element) {
        if (frame.h >= (this.lines[0]?.height ?? 0)) {
          // keepWithNext pushed everything out: place at least the first line to avoid an endless loop.
          const forced = placeLines(this.lines.slice(0, 1).map((l) => ({ ...l, keepWithNext: false })), frame);
          if (forced.element) elements.push(forced.element);
          this.lines = this.lines.slice(1);
          lastUsed = forced.used;
        }
        continue;
      }
      elements.push(element);
      this.lines = rest;
      lastUsed = used;
    }
    return { elements, lastUsed };
  }
}

/**
 * Sets a short text (title, name) as large as possible inside a box,
 * between `maxSize` and `minSize`, in at most `maxLines` lines.
 */
export function fitText(
  metrics: FontMetrics,
  text: string,
  style: TextStyle,
  box: Box,
  options: { minSize: number; maxLines?: number; verticalAlign?: 'top' | 'middle' | 'bottom' } = { minSize: 8 },
): TextElement | null {
  const maxLines = options.maxLines ?? 3;
  let size = style.size;
  let lines: Line[] = [];
  for (;;) {
    const sized = { ...style, size };
    lines = typeset(metrics, text, sized, box.w);
    const fits = lines.length <= maxLines && linesHeight(lines) <= box.h + 0.01 && widestWord(metrics, text, sized) <= box.w + 0.01;
    if (fits || size <= options.minSize) break;
    size = Math.max(options.minSize, size * 0.92);
  }
  if (lines.length === 0) return null;
  const lineLimit = lines.slice(0, maxLines);
  const height = linesHeight(lineLimit);
  const align = options.verticalAlign ?? 'top';
  const offset = align === 'middle' ? (box.h - height) / 2 : align === 'bottom' ? box.h - height : 0;
  const { element } = placeLines(lineLimit, { ...box, y: box.y + Math.max(0, offset), h: Math.max(box.h, height) });
  return element;
}

function widestWord(metrics: FontMetrics, text: string, style: TextStyle): number {
  const source = style.uppercase ? text.toLocaleUpperCase('ru-RU') : text;
  return Math.max(0, ...source.split(/\s+/).filter(Boolean).map((word) => measureWord(metrics, style, word).width));
}

/** Measures how tall a block of flowables would be at a width. */
export function measureFlowables(metrics: FontMetrics, flowables: Flowable[], width: number): number {
  return linesHeight(typesetFlowables(metrics, flowables, width));
}
