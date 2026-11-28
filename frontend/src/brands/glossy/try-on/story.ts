import type { CoverMeStyle } from '@px/portrait';
import { fit } from './canvas-text';
import { COVER_SIZE, type CoverFonts } from './draw-cover';

/** Backdrop of the story under the cover, per style. */
const BACKDROP: Record<CoverMeStyle, { color: string; ink: string; accent: string }> = {
  vogue: { color: '#0d0d0d', ink: '#ffffff', accent: '#e4007c' },
  tabloid: { color: '#e10600', ink: '#ffffff', accent: '#ffe600' },
  tender: { color: '#f2e6e1', ink: '#3b302c', accent: '#b86f6a' },
  noir: { color: '#0f0e0d', ink: '#eee7dc', accent: '#c9a24a' },
};

/**
 * A 1080×1920 story: the cover on the photo blurred in the style's colour, and the address to make
 * one's own. Keeps clear of the top and bottom strips where Instagram puts its buttons.
 */
export function drawStory(
  canvas: HTMLCanvasElement,
  style: CoverMeStyle,
  photo: CanvasImageSource | null,
  drawCoverAt: (ctx: CanvasRenderingContext2D) => void,
  fonts: CoverFonts,
  domain: string,
) {
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d')!;
  const theme = BACKDROP[style];
  ctx.fillStyle = theme.color;
  ctx.fillRect(0, 0, 1080, 1920);
  if (photo) {
    // A cheap, everywhere-supported blur: draw tiny, scale up smoothed.
    const tiny = document.createElement('canvas');
    tiny.width = 27;
    tiny.height = 48;
    const t = tiny.getContext('2d')!;
    const source = photo as HTMLCanvasElement;
    const scale = Math.max(27 / source.width, 48 / source.height);
    t.drawImage(source, (27 - source.width * scale) / 2, (48 - source.height * scale) / 2, source.width * scale, source.height * scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(tiny, -40, -40, 1160, 2000);
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.color;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(0, 0, 1080, 1920);
    ctx.globalAlpha = 1;
  }

  // The cover: 860 px wide, centred, with a soft shadow.
  const width = 860;
  const scale = width / COVER_SIZE.w;
  const height = COVER_SIZE.h * scale;
  const x = (1080 - width) / 2;
  const y = 250;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, width, height);
  ctx.restore();
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  drawCoverAt(ctx);
  ctx.restore();

  const below = y + height + 46;
  fit(ctx, 'Сделайте обложку для своего человека', { family: fonts.inter, weight: 600, size: 34, leading: 1.2, color: theme.ink, align: 'center' }, { x: 80, y: below, w: 920, h: 44 }, { minSize: 22, maxLines: 1 });
  fit(ctx, domain, { family: fonts.playfair, weight: 900, size: 64, leading: 1, color: theme.accent, align: 'center' }, { x: 80, y: below + 56, w: 920, h: 72 }, { minSize: 36, maxLines: 1 });
}

export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Не получилось сохранить картинку'))), type, quality));
}
