import { coverCrop, cropMarkLines, type Element, type Page } from '../domain/document';
import type { FontLibrary } from './fonts';

export interface SvgRenderOptions {
  /** Small upright JPEG of a photo, by media key; a grey placeholder is drawn without it. */
  thumbnail: (key: string) => Buffer | undefined;
}

const n = (value: number) => (Math.round(value * 100) / 100).toString();
const esc = (value: string) => value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/**
 * Self-contained SVG preview of one page: text is converted to glyph outlines (no fonts needed),
 * photos are embedded thumbnails (no external requests, so it renders inside an <img>).
 * Generated from the same layout model as the PDF, so positions match the print file exactly.
 * Nothing user-provided reaches the markup except as escaped attribute values or outlines.
 */
export function renderSvg(page: Page, fonts: FontLibrary, options: SvgRenderOptions): string {
  const glyphs = new Map<string, { id: string; d: string }>();
  const defs: string[] = [];
  const body: string[] = [];
  let clipCount = 0;

  const glyphId = (font: string, glyph: { id: number; path: { toSVG(): string } }) => {
    const key = `${font}:${glyph.id}`;
    let entry = glyphs.get(key);
    if (!entry) {
      entry = { id: `g${glyphs.size}`, d: glyph.path.toSVG() };
      glyphs.set(key, entry);
    }
    return entry.id;
  };

  const draw = (element: Element) => {
    switch (element.type) {
      case 'rect': {
        const { x, y, w, h } = element.box;
        const attrs = [
          `x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"`,
          element.radius ? `rx="${n(Math.min(element.radius, w / 2, h / 2))}"` : '',
          `fill="${element.fill ? esc(element.fill) : 'none'}"`,
          element.stroke ? `stroke="${esc(element.stroke.color)}" stroke-width="${n(element.stroke.width)}"` : '',
          element.stroke?.dash ? `stroke-dasharray="${element.stroke.dash.map(n).join(' ')}"` : '',
          element.opacity !== undefined ? `fill-opacity="${n(element.opacity)}"` : '',
        ];
        body.push(`<rect ${attrs.filter(Boolean).join(' ')}/>`);
        return;
      }
      case 'line':
        body.push(
          `<line x1="${n(element.from.x)}" y1="${n(element.from.y)}" x2="${n(element.to.x)}" y2="${n(element.to.y)}" stroke="${esc(element.color)}" stroke-width="${n(element.width)}"${element.dash ? ` stroke-dasharray="${element.dash.map(n).join(' ')}"` : ''}/>`,
        );
        return;
      case 'ellipse':
        body.push(
          `<ellipse cx="${n(element.cx)}" cy="${n(element.cy)}" rx="${n(element.rx)}" ry="${n(element.ry)}" fill="${element.fill ? esc(element.fill) : 'none'}"${element.stroke ? ` stroke="${esc(element.stroke.color)}" stroke-width="${n(element.stroke.width)}"` : ''}/>`,
        );
        return;
      case 'path':
        body.push(
          `<path d="${esc(element.d)}" fill="${element.fill ? esc(element.fill) : 'none'}"${element.stroke ? ` stroke="${esc(element.stroke.color)}" stroke-width="${n(element.stroke.width)}"` : ''}/>`,
        );
        return;
      case 'image': {
        const { x, y, w, h } = element.box;
        const clip = `c${clipCount++}`;
        defs.push(
          element.shape === 'circle'
            ? `<clipPath id="${clip}"><ellipse cx="${n(x + w / 2)}" cy="${n(y + h / 2)}" rx="${n(w / 2)}" ry="${n(h / 2)}"/></clipPath>`
            : `<clipPath id="${clip}"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"/></clipPath>`,
        );
        const thumb = options.thumbnail(element.photo.key);
        if (thumb) {
          const crop = coverCrop(element.photo, element.box, element.focusY);
          body.push(
            `<image clip-path="url(#${clip})" x="${n(crop.x)}" y="${n(crop.y)}" width="${n(crop.w)}" height="${n(crop.h)}" preserveAspectRatio="none" href="data:image/jpeg;base64,${thumb.toString('base64')}"/>`,
          );
        } else {
          body.push(`<rect clip-path="url(#${clip})" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="#d9d9d9"/>`);
        }
        if (element.stroke) {
          const stroke = `fill="none" stroke="${esc(element.stroke.color)}" stroke-width="${n(element.stroke.width)}"`;
          body.push(
            element.shape === 'circle'
              ? `<ellipse cx="${n(x + w / 2)}" cy="${n(y + h / 2)}" rx="${n(w / 2)}" ry="${n(h / 2)}" ${stroke}/>`
              : `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" ${stroke}/>`,
          );
        }
        return;
      }
      case 'text': {
        for (const line of element.lines) {
          const baseline = element.y + line.y + line.ascent;
          for (const piece of line.pieces) {
            const { font } = fonts.get(piece.font);
            const scale = line.style.size / font.unitsPerEm;
            const tracking = (line.style.tracking ?? 0) / scale;
            const run = font.layout(piece.text);
            let cursor = 0;
            const uses: string[] = [];
            run.glyphs.forEach((glyph, i) => {
              const position = run.positions[i]!;
              if (glyph.path.commands.length > 0) {
                const dx = cursor + position.xOffset;
                const dy = position.yOffset;
                uses.push(`<use href="#${glyphId(piece.font, glyph)}" x="${n(dx)}"${dy ? ` y="${n(dy)}"` : ''}/>`);
              }
              cursor += position.xAdvance + tracking;
            });
            if (uses.length > 0) {
              body.push(
                `<g fill="${esc(line.style.color)}" transform="translate(${n(element.x + piece.x)} ${n(baseline)}) scale(${scale.toFixed(5)} ${(-scale).toFixed(5)})">${uses.join('')}</g>`,
              );
            }
          }
        }
        return;
      }
    }
  };

  if (page.background) body.push(`<rect x="0" y="0" width="${n(page.size.w)}" height="${n(page.size.h)}" fill="${esc(page.background)}"/>`);
  for (const element of page.elements) draw(element);
  for (const [x1, y1, x2, y2] of cropMarkLines(page)) {
    body.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="#000" stroke-width="0.3"/>`);
  }

  const glyphDefs = [...glyphs.values()].map((g) => `<path id="${g.id}" d="${g.d}"/>`);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(page.size.w)} ${n(page.size.h)}" width="${n(page.size.w)}" height="${n(page.size.h)}">`,
    `<defs>${glyphDefs.join('')}${defs.join('')}</defs>`,
    // The viewBox is the trimmed page: whatever reaches into the bleed is cut off, as after trimming.
    body.join(''),
    '</svg>',
  ].join('');
}
