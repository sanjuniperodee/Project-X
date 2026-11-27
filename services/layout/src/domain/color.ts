/**
 * Colour helpers for art direction: the accent of an issue is taken from its cover photo,
 * so a red sweater gives a deep red issue and a sea backdrop a teal one.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  h *= 60;
  return { h, s, l };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

export function hexToRgb(hex: string): Rgb {
  const v = parseInt(hex.replace('#', ''), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

/**
 * The most characteristic vivid colour of an image (RGBA pixels): hues are binned by
 * 15°, each bin weighted by pixel count × saturation, skin tones and near-greys are
 * discounted. Returns null for black-and-white or muted photos.
 */
export function vividColor(rgba: Uint8Array): Hsl | null {
  const bins = Array.from({ length: 24 }, () => ({ weight: 0, h: 0, s: 0, l: 0 }));
  let considered = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const hsl = rgbToHsl({ r: rgba[i]!, g: rgba[i + 1]!, b: rgba[i + 2]! });
    if (hsl.s < 0.28 || hsl.l < 0.12 || hsl.l > 0.88) continue;
    considered++;
    // Skin (orange 10–40°, mid saturation) is in almost every portrait: it never wins.
    const skin = hsl.h >= 10 && hsl.h <= 40 && hsl.s < 0.65;
    const weight = hsl.s * hsl.s * (skin ? 0.15 : 1);
    const bin = bins[Math.floor(hsl.h / 15) % 24]!;
    bin.weight += weight;
    bin.h += hsl.h * weight;
    bin.s += hsl.s * weight;
    bin.l += hsl.l * weight;
  }
  const pixels = rgba.length / 4;
  const best = bins.reduce((a, b) => (b.weight > a.weight ? b : a));
  if (considered < pixels * 0.04 || best.weight < pixels * 0.012) return null;
  return { h: best.h / best.weight, s: best.s / best.weight, l: best.l / best.weight };
}

/**
 * Turns a photo colour into an accent that prints well on white and on black:
 * saturated, mid-dark, never neon.
 */
export function accentFrom(color: Hsl): string {
  return hslToHex({ h: color.h, s: Math.min(0.85, Math.max(0.55, color.s)), l: Math.min(0.48, Math.max(0.36, color.l)) });
}

/** Relative luminance (WCAG) for choosing text colour on a coloured background. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
