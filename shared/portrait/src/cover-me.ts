import { portraitCrop, type Rect } from './crop';
import type { Silhouette } from './silhouette';

/**
 * Where the four Cover Me covers put the hero's head. Shared by the print layout
 * (services/layout/src/templates/glossy-covers.ts) and the try-on on the landing, so a
 * customer sees on the site exactly the crop that goes to print. Units: PDF points on an
 * A4 page, origin at the top-left of the trimmed page (the bleed is negative).
 */
const MM = 72 / 25.4;
const mm = (value: number) => value * MM;

export const COVER_PAGE = { w: mm(210), h: mm(297), bleed: mm(3) } as const;
const FULL_BLEED: Rect = { x: -COVER_PAGE.bleed, y: -COVER_PAGE.bleed, w: COVER_PAGE.w + 2 * COVER_PAGE.bleed, h: COVER_PAGE.h + 2 * COVER_PAGE.bleed };

export type CoverMeStyle = 'vogue' | 'tabloid' | 'tender' | 'noir';

export interface CoverHeadSpec {
  /** The area the photo covers. */
  frame: Rect;
  /** Head top inside the masthead, for the cut-out; absent when the style never cuts out. */
  depthTop?: number;
  /** Head top when the head stays below the masthead. */
  plainTop: number;
  centerX: number;
  headWidth: number;
  /** The cut-out is drawn above this line (where the masthead and its shade end). */
  cutoutBottom: number;
}

export const COVER_ME_HEADS: Record<CoverMeStyle, CoverHeadSpec> = {
  vogue: { frame: FULL_BLEED, depthTop: mm(29), plainTop: mm(60), centerX: COVER_PAGE.w * 0.62, headWidth: COVER_PAGE.w * 0.34, cutoutBottom: mm(70) },
  tabloid: { frame: FULL_BLEED, depthTop: mm(27), plainTop: mm(62), centerX: COVER_PAGE.w * 0.66, headWidth: COVER_PAGE.w * 0.32, cutoutBottom: mm(54) },
  // A quiet print in a passe-partout: nothing breaks out of it.
  tender: { frame: { x: mm(22), y: mm(62), w: COVER_PAGE.w - mm(44), h: mm(168) }, plainTop: mm(76), centerX: COVER_PAGE.w / 2, headWidth: COVER_PAGE.w * 0.3, cutoutBottom: 0 },
  noir: { frame: FULL_BLEED, depthTop: mm(31), plainTop: mm(54), centerX: COVER_PAGE.w * 0.62, headWidth: COVER_PAGE.w * 0.32, cutoutBottom: mm(80) },
};

/** Zoom limit, points per photo pixel: the print keeps at least 150 dpi. */
export const COVER_MAX_SCALE = 72 / 150;
/** How far the head may land from its target before the cut-out is given up (clamped crops). */
const DEPTH_TOLERANCE = mm(6);

export interface CoverPortrait {
  /** Where the whole photo is drawn. */
  crop: Rect;
  /** The head stands in front of the masthead. */
  depth: boolean;
  /** The head on the page: cover lines and stickers keep clear of it. */
  head: Rect;
}

/**
 * Crop of a traced cover photo for a style: with headroom in the photo the head goes into the
 * masthead (and is cut out over it); otherwise below the masthead, without the cut-out.
 */
export function placeCoverPortrait(
  style: CoverMeStyle,
  photo: { width: number; height: number },
  silhouette: Pick<Silhouette, 'head'>,
  maxScale = COVER_MAX_SCALE,
): CoverPortrait {
  const spec = COVER_ME_HEADS[style];
  const at = (headTop: number) => {
    const crop = portraitCrop(photo, silhouette, spec.frame, { headTop, centerX: spec.centerX, headWidth: spec.headWidth }, maxScale);
    const { head } = silhouette;
    return { crop, head: { x: crop.x + (head.cx - head.width / 2) * crop.w, y: crop.y + head.top * crop.h, w: head.width * crop.w, h: head.height * crop.h } };
  };
  // A head cut by the top edge of the photo would show a flat edge in the middle of the masthead.
  if (spec.depthTop !== undefined && silhouette.head.top > 0.012) {
    const deep = at(spec.depthTop);
    if (Math.abs(deep.head.y - spec.depthTop) <= DEPTH_TOLERANCE) return { ...deep, depth: true };
  }
  return { ...at(spec.plainTop), depth: false };
}

/** Everything above the style's cut-out line, across the bleed. */
export function cutoutBand(style: CoverMeStyle): Rect {
  const bottom = COVER_ME_HEADS[style].cutoutBottom;
  return { x: FULL_BLEED.x, y: FULL_BLEED.y, w: FULL_BLEED.w, h: bottom + COVER_PAGE.bleed };
}
