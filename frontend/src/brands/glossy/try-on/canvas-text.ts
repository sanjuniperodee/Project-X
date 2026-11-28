/**
 * Text on a canvas the way the layout service sets it: a box, a starting size, shrinking
 * down to `minSize` until the text fits in `maxLines`. Units are whatever the canvas
 * transform makes them (the try-on draws in PDF points).
 */
export interface TextSpec {
  /** CSS font-family list, e.g. the value of `--font-playfair`. */
  family: string;
  weight?: number;
  italic?: boolean;
  size: number;
  /** Line height as a multiple of the size. */
  leading: number;
  color: string;
  align?: 'left' | 'center' | 'right';
  /** Extra space between letters, in points (as in the layout model). */
  tracking?: number;
  uppercase?: boolean;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FitOptions {
  minSize: number;
  maxLines?: number;
  verticalAlign?: 'top' | 'middle' | 'bottom';
}

export function fontOf(spec: Pick<TextSpec, 'family' | 'weight' | 'italic'>, size: number): string {
  return `${spec.italic ? 'italic ' : ''}${spec.weight ?? 400} ${size}px ${spec.family}`;
}

/** Width of a run, letter-spacing included. */
export function measure(ctx: CanvasRenderingContext2D, text: string, spec: Pick<TextSpec, 'family' | 'weight' | 'italic' | 'tracking'>, size: number): number {
  ctx.font = fontOf(spec, size);
  const tracking = spec.tracking ?? 0;
  return ctx.measureText(text).width + (tracking ? tracking * Math.max(0, [...text].length - 1) : 0);
}

/** Greedy word wrap; null when a word is wider than the box or the lines run out. */
function wrap(ctx: CanvasRenderingContext2D, text: string, spec: TextSpec, size: number, width: number, maxLines: number): string[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(ctx, candidate, spec, size) <= width) {
      current = candidate;
      continue;
    }
    if (!current || measure(ctx, word, spec, size) > width) return null;
    lines.push(current);
    current = word;
    if (lines.length >= maxLines) return null;
  }
  if (current) lines.push(current);
  return lines.length <= maxLines ? lines : null;
}

/** Sets `text` in `box`; returns the height used (0 for empty text). */
export function fit(ctx: CanvasRenderingContext2D, raw: string, spec: TextSpec, box: Box, options: FitOptions): number {
  const text = (spec.uppercase ? raw.toLocaleUpperCase('ru-RU') : raw).trim();
  if (!text) return 0;
  const maxLines = options.maxLines ?? 99;
  let size = spec.size;
  let lines: string[] | null = null;
  for (; size >= options.minSize; size = Math.round((size - Math.max(0.5, size * 0.04)) * 100) / 100) {
    lines = wrap(ctx, text, spec, size, box.w, maxLines);
    if (lines && lines.length * size * spec.leading <= box.h + 0.01) break;
    lines = null;
  }
  if (!lines) {
    // At the smallest size whatever does not fit is cut with an ellipsis.
    size = options.minSize;
    lines = wrap(ctx, text, spec, size, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)!.slice(0, maxLines);
    lines = lines.map((line) => ellipsize(ctx, line, spec, size, box.w));
  }

  const lineHeight = size * spec.leading;
  const used = lines.length * lineHeight;
  const offset = options.verticalAlign === 'bottom' ? box.h - used : options.verticalAlign === 'middle' ? (box.h - used) / 2 : 0;
  ctx.fillStyle = spec.color;
  ctx.font = fontOf(spec, size);
  ctx.textBaseline = 'alphabetic';
  lines.forEach((line, i) => {
    const width = measure(ctx, line, spec, size);
    const x = spec.align === 'center' ? box.x + (box.w - width) / 2 : spec.align === 'right' ? box.x + box.w - width : box.x;
    // Baseline about four fifths down the line box, like the font metrics of the layout engine.
    const baseline = box.y + offset + i * lineHeight + lineHeight * 0.5 + size * 0.34;
    draw(ctx, line, x, baseline, spec.tracking ?? 0);
  });
  return offset + used;
}

function ellipsize(ctx: CanvasRenderingContext2D, line: string, spec: TextSpec, size: number, width: number): string {
  if (measure(ctx, line, spec, size) <= width) return line;
  let cut = line;
  while (cut.length > 1 && measure(ctx, `${cut}…`, spec, size) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** fillText, letter by letter when the text is tracked (canvas letter-spacing is not everywhere yet). */
function draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  if (!tracking) {
    ctx.fillText(text, x, y);
    return;
  }
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + tracking;
  }
}
