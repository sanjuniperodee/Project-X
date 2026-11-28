import type { Silhouette } from './silhouette';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PortraitTarget {
  /** Where the top of the head goes (same units as the frame). */
  headTop: number;
  /** Horizontal centre of the head. */
  centerX: number;
  /** Width the head should have on the page. */
  headWidth: number;
}

/**
 * Where to draw the whole photo so the head lands on the target: zoomed so the head has the
 * wanted width, then moved so its top and centre sit where the composition needs them.
 * The photo always covers `frame` (no empty corners); `maxScale` (units per photo pixel)
 * caps the zoom so print resolution stays acceptable. Shared by the print layout and the
 * try-on in the browser, so both crop a portrait identically.
 */
export function portraitCrop(
  photo: { width: number; height: number },
  silhouette: Pick<Silhouette, 'head'>,
  frame: Rect,
  target: PortraitTarget,
  maxScale = Number.POSITIVE_INFINITY,
): Rect {
  const cover = Math.max(frame.w / photo.width, frame.h / photo.height);
  const wanted = target.headWidth / Math.max(silhouette.head.width * photo.width, 1);
  const scale = Math.max(cover, Math.min(wanted, Math.max(cover, maxScale)));
  const w = photo.width * scale;
  const h = photo.height * scale;
  const x = clamp(target.centerX - silhouette.head.cx * w, frame.x + frame.w - w, frame.x);
  const y = clamp(target.headTop - silhouette.head.top * h, frame.y + frame.h - h, frame.y);
  return { x, y, w, h };
}

/** The outline placed where the photo is drawn, as SVG path data (also valid for Path2D and pdfkit). */
export function outlinePath(silhouette: Pick<Silhouette, 'outline'>, crop: Rect, digits = 2): string {
  const { outline } = silhouette;
  const parts: string[] = [];
  for (let i = 0; i < outline.length; i += 2) {
    const x = (crop.x + outline[i]! * crop.w).toFixed(digits);
    const y = (crop.y + outline[i + 1]! * crop.h).toFixed(digits);
    parts.push(`${i === 0 ? 'M' : 'L'}${x} ${y}`);
  }
  return `${parts.join(' ')} Z`;
}

function clamp(value: number, min: number, max: number): number {
  return min > max ? (min + max) / 2 : Math.min(max, Math.max(min, value));
}
