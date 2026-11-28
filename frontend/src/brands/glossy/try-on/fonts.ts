import type { CoverFonts } from './draw-cover';

/** The cover typefaces as the page loaded them (next/font variables), ready for canvas text. */
export async function loadCoverFonts(): Promise<CoverFonts> {
  const css = getComputedStyle(document.documentElement);
  const family = (variable: string, fallback: string) => css.getPropertyValue(variable).trim() || fallback;
  const fonts: CoverFonts = {
    playfair: family('--font-playfair', 'serif'),
    inter: family('--font-inter-tight', 'sans-serif'),
    dela: family('--font-dela', 'sans-serif'),
    oswald: family('--font-oswald', 'sans-serif'),
    cormorant: family('--font-cormorant', 'serif'),
  };
  // Canvas does not trigger font loading: ask for every face the covers use.
  const faces = [
    `900 16px ${fonts.playfair}`,
    `italic 900 16px ${fonts.playfair}`,
    `400 16px ${fonts.inter}`,
    `600 16px ${fonts.inter}`,
    `700 16px ${fonts.inter}`,
    `400 16px ${fonts.dela}`,
    `700 16px ${fonts.oswald}`,
    `italic 300 16px ${fonts.cormorant}`,
    `italic 500 16px ${fonts.cormorant}`,
    `600 16px ${fonts.cormorant}`,
    `italic 600 16px ${fonts.cormorant}`,
  ];
  await Promise.all(faces.map((face) => document.fonts.load(face, 'COVER ME Айгерим').catch(() => [])));
  return fonts;
}
