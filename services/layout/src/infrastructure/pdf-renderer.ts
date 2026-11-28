import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import PDFDocument from 'pdfkit';
import { outlinePath } from '@px/portrait';
import { BLEED, cropMarkLines, placement, type Element, type LayoutDocument, type Page } from '../domain/document';
import type { FontLibrary } from './fonts';

export interface PdfRenderOptions {
  /** Local file of every photo, by media key (downloaded once by the photo store). */
  photoPath: (key: string) => string | undefined;
  author: string;
}

/**
 * Print PDF with pdfkit. Pages carry 3 mm bleed with TrimBox/BleedBox set for the print shop.
 * The document is streamed to a file: photos are embedded as they are drawn and released,
 * so memory stays flat however many photos the book has.
 */
export async function renderPdf(document: LayoutDocument, fonts: FontLibrary, file: string, options: PdfRenderOptions): Promise<void> {
  const pdf = new PDFDocument({
    autoFirstPage: false,
    // No default Helvetica: it would need pdfkit's AFM files next to the bundle.
    font: null as unknown as string,
    compress: true,
    info: { Title: document.title, Author: options.author, Creator: `Project X layout (${document.template})` },
  });
  const out = createWriteStream(file);
  pdf.pipe(out);

  const registered = new Set<string>();
  const useFont = (key: string) => {
    if (!registered.has(key)) {
      pdf.registerFont(key, fonts.get(key).data);
      registered.add(key);
    }
    pdf.font(key);
  };

  for (const page of document.pages) {
    const width = page.size.w + 2 * BLEED;
    const height = page.size.h + 2 * BLEED;
    pdf.addPage({ size: [width, height], margin: 0 });
    // PDF boxes are bottom-up; the trim box is symmetric inside the bleed.
    const dictionary = pdf.page.dictionary.data as Record<string, unknown>;
    dictionary.TrimBox = [BLEED, BLEED, BLEED + page.size.w, BLEED + page.size.h];
    dictionary.BleedBox = [0, 0, width, height];

    pdf.save();
    pdf.translate(BLEED, BLEED);
    if (page.background) pdf.rect(-BLEED, -BLEED, width, height).fill(page.background);
    for (const element of page.elements) {
      drawElement(pdf, element, useFont, options);
      // pdfkit does not honour backpressure: after every photo, let the file catch up,
      // otherwise the whole PDF (hundreds of MB with phone photos) piles up in memory.
      if (element.type === 'image') await flush(out);
    }
    drawCropMarks(pdf, page);
    pdf.restore();
  }

  pdf.end();
  await finished(out);
}

async function flush(out: NodeJS.WritableStream & { writableNeedDrain: boolean }) {
  await new Promise((resolve) => setImmediate(resolve));
  if (out.writableNeedDrain) await once(out, 'drain');
}

function drawElement(pdf: PDFKit.PDFDocument, element: Element, useFont: (key: string) => void, options: PdfRenderOptions) {
  switch (element.type) {
    case 'rect': {
      const { x, y, w, h } = element.box;
      pdf.save();
      if (element.opacity !== undefined) pdf.fillOpacity(element.opacity);
      if (element.radius) pdf.roundedRect(x, y, w, h, Math.min(element.radius, w / 2, h / 2));
      else pdf.rect(x, y, w, h);
      if (element.stroke) {
        pdf.lineWidth(element.stroke.width);
        if (element.stroke.dash) pdf.dash(element.stroke.dash[0]!, { space: element.stroke.dash[1] ?? element.stroke.dash[0]! });
      }
      if (element.gradient) {
        const gradient = element.gradient.horizontal ? pdf.linearGradient(x, y, x + w, y) : pdf.linearGradient(x, y, x, y + h);
        for (const [offset, opacity] of element.gradient.stops) gradient.stop(offset, element.gradient.color, opacity);
        pdf.fill(gradient);
      } else if (element.fill && element.stroke) pdf.fillAndStroke(element.fill, element.stroke.color);
      else if (element.fill) pdf.fill(element.fill);
      else if (element.stroke) pdf.stroke(element.stroke.color);
      pdf.restore();
      return;
    }
    case 'line': {
      pdf.save();
      pdf.lineWidth(element.width);
      if (element.dash) pdf.dash(element.dash[0]!, { space: element.dash[1] ?? element.dash[0]! });
      pdf.moveTo(element.from.x, element.from.y).lineTo(element.to.x, element.to.y).stroke(element.color);
      pdf.restore();
      return;
    }
    case 'ellipse': {
      pdf.save();
      pdf.ellipse(element.cx, element.cy, element.rx, element.ry);
      if (element.stroke) pdf.lineWidth(element.stroke.width);
      if (element.fill && element.stroke) pdf.fillAndStroke(element.fill, element.stroke.color);
      else if (element.fill) pdf.fill(element.fill);
      else if (element.stroke) pdf.stroke(element.stroke.color);
      pdf.restore();
      return;
    }
    case 'path': {
      pdf.save();
      pdf.path(element.d);
      if (element.stroke) pdf.lineWidth(element.stroke.width);
      if (element.fill && element.stroke) pdf.fillAndStroke(element.fill, element.stroke.color);
      else if (element.fill) pdf.fill(element.fill);
      else if (element.stroke) pdf.stroke(element.stroke.color);
      pdf.restore();
      return;
    }
    case 'image': {
      const file = options.photoPath(element.photo.key);
      const { x, y, w, h } = element.box;
      const crop = placement(element);
      if (element.cutout) {
        // The person only, over what was drawn before (the masthead): the same embedded photo, clipped twice.
        const silhouette = element.photo.silhouette;
        if (!silhouette || !file) return;
        const d = outlinePath(silhouette, crop);
        const { outline, overlays = [] } = element.cutout;
        pdf.save();
        pdf.rect(x, y, w, h).clip();
        if (outline) {
          pdf.save();
          pdf.path(d).lineWidth(outline.width * 2).lineJoin('round').stroke(outline.color);
          pdf.restore();
        }
        pdf.path(d).clip();
        pdf.image(file, crop.x, crop.y, { width: crop.w, height: crop.h });
        for (const overlay of overlays) drawElement(pdf, overlay, useFont, options);
        pdf.restore();
        return;
      }
      pdf.save();
      if (element.shape === 'circle') pdf.ellipse(x + w / 2, y + h / 2, w / 2, h / 2).clip();
      else pdf.rect(x, y, w, h).clip();
      if (file) {
        // Width/height are the upright size; pdfkit applies the EXIF rotation itself.
        pdf.image(file, crop.x, crop.y, { width: crop.w, height: crop.h });
      } else {
        pdf.rect(x, y, w, h).fill('#d9d9d9');
      }
      pdf.restore();
      if (element.stroke) {
        pdf.save();
        pdf.lineWidth(element.stroke.width);
        if (element.shape === 'circle') pdf.ellipse(x + w / 2, y + h / 2, w / 2, h / 2).stroke(element.stroke.color);
        else pdf.rect(x, y, w, h).stroke(element.stroke.color);
        pdf.restore();
      }
      return;
    }
    case 'text': {
      for (const line of element.lines) {
        const baseline = element.y + line.y + line.ascent;
        pdf.fontSize(line.style.size).fillColor(line.style.color);
        for (const piece of line.pieces) {
          useFont(piece.font);
          pdf.text(piece.text, element.x + piece.x, baseline, {
            lineBreak: false,
            baseline: 'alphabetic',
            characterSpacing: line.style.tracking ?? 0,
          });
        }
      }
      return;
    }
  }
}

/** Short registration marks at each cut line, outside the cards. */
function drawCropMarks(pdf: PDFKit.PDFDocument, page: Page) {
  const lines = cropMarkLines(page);
  if (lines.length === 0) return;
  pdf.save().lineWidth(0.3);
  for (const [x1, y1, x2, y2] of lines) pdf.moveTo(x1, y1).lineTo(x2, y2).stroke('#000000');
  pdf.restore();
}
