import type { Draft, LayoutSource, MediaRef, Product } from '@px/contracts';
import type { Box, Element, ImageElement, LayoutDocument, Page, PhotoRef, Size, TextStyle } from '../domain/document';
import { Materials } from '../domain/materials';
import { fitText, Story, type Flowable, type FontMetrics } from '../domain/text';

/** Photos that could be read and placed; unsupported or missing files are left out (with a warning). */
export interface PhotoLibrary {
  get(ref: MediaRef): PhotoRef | undefined;
}

export interface TemplateInput {
  product: Product;
  source: LayoutSource;
  draft: Draft;
  photos: PhotoLibrary;
}

export interface Template {
  /** Template id and revision, stored with every layout version. */
  readonly id: string;
  build(input: TemplateInput, metrics: FontMetrics): LayoutDocument;
}

/** Page builder shared by the templates. */
export class Composer {
  readonly pages: Page[] = [];
  readonly warnings: string[] = [];
  readonly materials: Materials;
  private readonly used = new Set<string>();

  constructor(
    readonly input: TemplateInput,
    readonly metrics: FontMetrics,
  ) {
    this.materials = new Materials(input.product, input.source.answers);
  }

  addPage(kind: string, size: Size, background?: string): Page {
    const page: Page = { kind, size, background, elements: [] };
    this.pages.push(page);
    return page;
  }

  /** Resolves photo references to placeable photos, skipping unreadable ones. */
  resolve(refs: MediaRef[]): PhotoRef[] {
    return refs.flatMap((ref) => {
      const photo = this.input.photos.get(ref);
      return photo ? [photo] : [];
    });
  }

  /** Marks photos as placed and returns those not used yet. */
  take(photos: PhotoRef[], count = photos.length): PhotoRef[] {
    const fresh = photos.filter((p) => !this.used.has(p.key)).slice(0, count);
    for (const photo of fresh) this.used.add(photo.key);
    return fresh;
  }

  isUsed(photo: PhotoRef): boolean {
    return this.used.has(photo.key);
  }

  image(page: Page, photo: PhotoRef, box: Box, options: Omit<ImageElement, 'type' | 'photo' | 'box'> = {}): void {
    this.used.add(photo.key);
    page.elements.push({ type: 'image', photo, box, focusY: photo.height > photo.width ? 0.3 : 0.5, ...options });
  }

  rect(page: Page, box: Box, fill: string | undefined, extra: Partial<Extract<Element, { type: 'rect' }>> = {}): void {
    page.elements.push({ type: 'rect', box, fill, ...extra });
  }

  line(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, color: string, width = 0.75): void {
    page.elements.push({ type: 'line', from, to, color, width });
  }

  /** Sets text in a box, shrinking it down to `minSize` if needed. Returns the height used. */
  fit(
    page: Page,
    text: string,
    style: TextStyle,
    box: Box,
    options: { minSize: number; maxLines?: number; verticalAlign?: 'top' | 'middle' | 'bottom' },
  ): number {
    if (!text.trim()) return 0;
    const element = fitText(this.metrics, text, style, box, options);
    if (!element) return 0;
    page.elements.push(element);
    const last = element.lines.at(-1)!;
    return element.y - box.y + last.y + last.height;
  }

  /** Sets flowing text into one frame; returns what did not fit. */
  text(page: Page, flowables: Flowable[], frame: Box): { story: Story; used: number } {
    const story = new Story(this.metrics, flowables, frame.w);
    const { elements, lastUsed } = story.fill([frame]);
    page.elements.push(...elements);
    return { story, used: lastUsed };
  }

  /** Continues a story over the frames of a page. */
  flow(page: Page, story: Story, frames: Box[]): number {
    const { elements, lastUsed } = story.fill(frames);
    page.elements.push(...elements);
    return lastUsed;
  }

  story(flowables: Flowable[], width: number): Story {
    return new Story(this.metrics, flowables, width);
  }

  measure(flowables: Flowable[], width: number): number {
    return new Story(this.metrics, flowables, width).remainingHeight;
  }

  warn(message: string): void {
    if (!this.warnings.includes(message)) this.warnings.push(message);
  }

  document(title: string, template: string): LayoutDocument {
    return { title, template, pages: this.pages, warnings: this.warnings };
  }
}

/** Splits a frame into equal columns. */
export function columns(frame: Box, count: number, gutter: number): Box[] {
  const w = (frame.w - gutter * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({ x: frame.x + i * (w + gutter), y: frame.y, w, h: frame.h }));
}

/** Paragraphs of a draft body: lines starting with "- " become bullets, blank lines separate paragraphs. */
export function paragraphs(body: string): string[] {
  return body
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** A draft section that is a list of short lines (rules, facts) rather than prose. */
export function isListLike(body: string): boolean {
  const lines = paragraphs(body);
  return lines.length >= 3 && lines.every((l) => l.length <= 140);
}

/** "Label: value" lines produced by the template generator, rendered as Q&A. */
export function splitLabel(line: string): { label: string; value: string } | null {
  const match = /^([^:]{2,90}):\s+(.+)$/.exec(line);
  return match ? { label: match[1]!.trim(), value: match[2]!.trim() } : null;
}

export function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
}

/** Grid of photo boxes for a photo page with `count` photos (1–4), with the first one larger. */
export function photoGrid(frame: Box, count: number, gap: number): Box[] {
  const { x, y, w, h } = frame;
  if (count <= 1) return [frame];
  if (count === 2) {
    const hh = (h - gap) / 2;
    return [
      { x, y, w, h: hh },
      { x, y: y + hh + gap, w, h: hh },
    ];
  }
  if (count === 3) {
    const top = (h - gap) * 0.6;
    const bw = (w - gap) / 2;
    return [
      { x, y, w, h: top },
      { x, y: y + top + gap, w: bw, h: h - top - gap },
      { x: x + bw + gap, y: y + top + gap, w: bw, h: h - top - gap },
    ];
  }
  const bw = (w - gap) / 2;
  const bh = (h - gap) / 2;
  return [
    { x, y, w: bw, h: bh },
    { x: x + bw + gap, y, w: bw, h: bh },
    { x, y: y + bh + gap, w: bw, h: bh },
    { x: x + bw + gap, y: y + bh + gap, w: bw, h: bh },
  ];
}

/** Rounds a page count up to a multiple of 4 (saddle-stitched and sewn books are printed in sheets of 4 pages). */
export function roundToSignature(pages: number): number {
  return Math.ceil(pages / 4) * 4;
}

/**
 * Vertical flow of blocks (text that may break across pages, photo rows that may not)
 * down a content frame, opening new pages as needed.
 */
export class BlockFlow {
  page: Page;
  y: number;

  constructor(
    private readonly c: Composer,
    private readonly frame: Box,
    private readonly newPage: () => Page,
    first?: { page: Page; y: number },
  ) {
    this.page = first?.page ?? newPage();
    this.y = first?.y ?? frame.y;
  }

  get bottom(): number {
    return this.frame.y + this.frame.h;
  }

  get remaining(): number {
    return this.bottom - this.y;
  }

  break(): void {
    this.page = this.newPage();
    this.y = this.frame.y;
  }

  space(height: number): void {
    this.y += height;
  }

  /** Reserves a block that must stay on one page. */
  block(height: number, draw: (page: Page, y: number) => void): void {
    if (height > this.remaining && this.y > this.frame.y) this.break();
    draw(this.page, this.y);
    this.y += height;
  }

  /** Text, broken across pages when it does not fit. `minLines` keeps short leftovers off the bottom. */
  text(flowables: Flowable[], minLines = 2): void {
    const story = this.c.story(flowables, this.frame.w);
    while (!story.done) {
      const lineHeight = story.firstLineHeight;
      if (this.remaining < lineHeight * Math.min(minLines, story.lineCount)) this.break();
      const used = this.c.flow(this.page, story, [{ x: this.frame.x, y: this.y, w: this.frame.w, h: this.remaining }]);
      this.y += used;
      if (!story.done) this.break();
    }
  }
}

/**
 * Draft sections that carry editorial text. The template generator returns one section per
 * questionnaire step ("Label: value" lines); those the template renders from structured answers
 * (photos, family tree, players…) are left out, as are bare photo counts.
 */
export function editorialSections(input: TemplateInput, structuralSteps: string[]): Array<{ heading: string; body: string }> {
  const skip = new Set(
    input.product.steps.filter((s) => structuralSteps.includes(s.id)).map((s) => s.title.trim().toLowerCase()),
  );
  return input.draft.sections
    .filter((section) => !skip.has(section.heading.trim().toLowerCase()))
    .map((section) => ({
      heading: section.heading,
      body: section.body
        .split('\n')
        .filter((line) => !/:\s*\d+\s+фото\s*$/i.test(line))
        .join('\n'),
    }))
    .filter((section) => section.body.trim().length > 0);
}
