import { accentFrom, hexToRgb, hslToHex, rgbToHsl } from '../domain/color';
import type { FontKey } from '../domain/document';

/**
 * Cover Me styles. The customer picks one in the questionnaire («Настроение номера»);
 * the same rubrics are then set in a different visual language: palette, typefaces,
 * how headlines and labels behave, and the composition of the cover.
 */
export type GlossyStyle = 'vogue' | 'tabloid' | 'tender' | 'noir';
export const GLOSSY_STYLES: readonly GlossyStyle[] = ['vogue', 'tabloid', 'tender', 'noir'];

export interface GlossyTheme {
  id: GlossyStyle;
  /** Page and text. */
  paper: string;
  ink: string;
  muted: string;
  hairline: string;
  /** The issue's signature colour and the text set on it. */
  accent: string;
  onAccent: string;
  /** Tinted panel (dossier) and neutral panel (tastes) with its cards. */
  soft: string;
  panel: string;
  card: string;
  /** Dramatic pages (in numbers, back cover, quotes): background, text, highlight, rules. */
  dark: string;
  onDark: string;
  darkAccent: string;
  darkRule: string;
  /** Type set over photos and the shade behind it. */
  onPhoto: string;
  shadow: string;
  fonts: {
    masthead: FontKey;
    display: FontKey;
    displayItalic: FontKey;
    serif: FontKey;
    serifBold: FontKey;
    serifItalic: FontKey;
    sans: FontKey;
    sansSemi: FontKey;
    sansBold: FontKey;
    numeral: FontKey;
  };
  masthead: string;
  mastheadTracking: number;
  headlineUppercase: boolean;
  headlineTracking: number;
  /** Rubric labels as plain coloured text, or white text on an accent bar. */
  kicker: 'text' | 'bar';
  /** Single portraits on text pages: rectangles, or circles for the tender style. */
  portraitShape: 'rect' | 'circle';
  cover: 'classic' | 'tabloid' | 'airy' | 'noir';
}

const VOGUE: GlossyTheme = {
  id: 'vogue',
  paper: '#ffffff',
  ink: '#0a0a0a',
  muted: '#6b6b6b',
  hairline: '#d9d4d6',
  accent: '#e4007c',
  onAccent: '#ffffff',
  soft: '#fbe4ef',
  panel: '#f3f1f2',
  card: '#ffffff',
  dark: '#0a0a0a',
  onDark: '#ffffff',
  darkAccent: '#e4007c',
  darkRule: '#3a3a3a',
  onPhoto: '#ffffff',
  shadow: '#000000',
  fonts: {
    masthead: 'playfair-900',
    display: 'playfair-900',
    displayItalic: 'playfair-900-italic',
    serif: 'playfair-400',
    serifBold: 'playfair-700',
    serifItalic: 'playfair-italic',
    sans: 'inter-400',
    sansSemi: 'inter-600',
    sansBold: 'inter-700',
    numeral: 'playfair-900',
  },
  masthead: 'COVER ME',
  mastheadTracking: -1,
  headlineUppercase: false,
  headlineTracking: 0,
  kicker: 'text',
  portraitShape: 'rect',
  cover: 'classic',
};

const TABLOID: GlossyTheme = {
  id: 'tabloid',
  paper: '#ffffff',
  ink: '#111111',
  muted: '#4d4d4d',
  hairline: '#111111',
  accent: '#e10600',
  onAccent: '#ffffff',
  soft: '#ffe600',
  panel: '#ffe600',
  card: '#ffffff',
  dark: '#e10600',
  onDark: '#ffffff',
  darkAccent: '#ffe600',
  darkRule: '#ff5a4f',
  onPhoto: '#ffffff',
  shadow: '#000000',
  fonts: {
    masthead: 'dela-400',
    display: 'oswald-700',
    displayItalic: 'oswald-700',
    serif: 'inter-600',
    serifBold: 'oswald-700',
    serifItalic: 'oswald-500',
    sans: 'inter-400',
    sansSemi: 'inter-600',
    sansBold: 'inter-700',
    numeral: 'dela-400',
  },
  masthead: 'COVER ME',
  mastheadTracking: 0,
  headlineUppercase: true,
  headlineTracking: 0.4,
  kicker: 'bar',
  portraitShape: 'rect',
  cover: 'tabloid',
};

const TENDER: GlossyTheme = {
  id: 'tender',
  paper: '#fdfaf7',
  ink: '#3b302c',
  muted: '#8c7d76',
  hairline: '#e5d9d1',
  accent: '#b86f6a',
  onAccent: '#ffffff',
  soft: '#f4e7e2',
  panel: '#f6efe9',
  card: '#fffdfb',
  dark: '#efe2db',
  onDark: '#3b302c',
  darkAccent: '#b86f6a',
  darkRule: '#dccbc2',
  onPhoto: '#ffffff',
  shadow: '#2a201c',
  fonts: {
    masthead: 'cormorant-300-italic',
    display: 'cormorant-600',
    displayItalic: 'cormorant-600-italic',
    serif: 'cormorant-400',
    serifBold: 'cormorant-600',
    serifItalic: 'cormorant-italic',
    sans: 'inter-400',
    sansSemi: 'inter-600',
    sansBold: 'inter-600',
    numeral: 'cormorant-300-italic',
  },
  masthead: 'cover me',
  mastheadTracking: 0,
  headlineUppercase: false,
  headlineTracking: 0,
  kicker: 'text',
  portraitShape: 'circle',
  cover: 'airy',
};

const NOIR: GlossyTheme = {
  id: 'noir',
  paper: '#0f0e0d',
  ink: '#eee7dc',
  muted: '#948a7d',
  hairline: '#3b352d',
  accent: '#c9a24a',
  onAccent: '#0f0e0d',
  soft: '#181614',
  panel: '#161412',
  card: '#1f1c19',
  dark: '#000000',
  onDark: '#eee7dc',
  darkAccent: '#c9a24a',
  darkRule: '#2e2a24',
  onPhoto: '#eee7dc',
  shadow: '#000000',
  fonts: {
    masthead: 'cormorant-600',
    display: 'cormorant-600',
    displayItalic: 'cormorant-600-italic',
    serif: 'cormorant-400',
    serifBold: 'cormorant-600',
    serifItalic: 'cormorant-italic',
    sans: 'inter-400',
    sansSemi: 'inter-600',
    sansBold: 'inter-600',
    numeral: 'playfair-italic',
  },
  masthead: 'COVER ME',
  mastheadTracking: 9,
  headlineUppercase: true,
  headlineTracking: 1.6,
  kicker: 'text',
  portraitShape: 'rect',
  cover: 'noir',
};

const THEMES: Record<GlossyStyle, GlossyTheme> = { vogue: VOGUE, tabloid: TABLOID, tender: TENDER, noir: NOIR };

export function isGlossyStyle(value: string): value is GlossyStyle {
  return (GLOSSY_STYLES as readonly string[]).includes(value);
}

/**
 * The theme of one issue. «Глянец» and «Нежность» take their accent from the cover photo
 * (a red sweater gives a deep red issue); «Таблоид» and «Нуар» keep their signature colours.
 */
export function themeFor(style: string, coverVivid?: string): GlossyTheme {
  const base = THEMES[isGlossyStyle(style) ? style : 'vogue'];
  if (!coverVivid || (base.id !== 'vogue' && base.id !== 'tender')) return base;
  const hsl = rgbToHsl(hexToRgb(coverVivid));
  if (base.id === 'vogue') {
    const accent = accentFrom(hsl);
    return { ...base, accent, darkAccent: hslToHex({ h: hsl.h, s: 0.85, l: 0.55 }), soft: hslToHex({ h: hsl.h, s: 0.6, l: 0.94 }) };
  }
  // Tender: the same hue, powdered.
  const accent = hslToHex({ h: hsl.h, s: 0.35, l: 0.55 });
  return { ...base, accent, darkAccent: accent, soft: hslToHex({ h: hsl.h, s: 0.35, l: 0.93 }), dark: hslToHex({ h: hsl.h, s: 0.3, l: 0.9 }) };
}
