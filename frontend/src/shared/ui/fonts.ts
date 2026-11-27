import { Cormorant_Garamond, Inter_Tight, Literata, Onest, Playfair_Display, Rubik, Unbounded } from 'next/font/google';

/**
 * Every typeface supports Cyrillic incl. Kazakh letters (cyrillic-ext).
 * next/font needs literal options, hence the repetition.
 * Each brand maps them to `--f-display` / `--f-body` in globals.css.
 */

/** Studio hub & back-office. */
const onest = Onest({ subsets: ['latin', 'cyrillic', 'cyrillic-ext'], variable: '--font-onest', display: 'swap' });

/** Cover Me: Didone-like display + tight grotesque for captions. */
const playfair = Playfair_Display({
  // Playfair has no cyrillic-ext; Cover Me copy needs no Kazakh-specific letters.
  subsets: ['latin', 'cyrillic'],
  variable: '--font-playfair',
  style: ['normal', 'italic'],
  display: 'swap',
  preload: false,
});
const interTight = Inter_Tight({ subsets: ['latin', 'cyrillic', 'cyrillic-ext'], variable: '--font-inter-tight', display: 'swap', preload: false });

/** Шежіре: calligraphic old-style display + a bookish text serif. */
const cormorant = Cormorant_Garamond({
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  variable: '--font-cormorant',
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  preload: false,
});
const literata = Literata({ subsets: ['latin', 'cyrillic', 'cyrillic-ext'], variable: '--font-literata', display: 'swap', preload: false });

/** MyGame: chunky rounded display + friendly sans. */
const unbounded = Unbounded({ subsets: ['latin', 'cyrillic', 'cyrillic-ext'], variable: '--font-unbounded', display: 'swap', preload: false });
const rubik = Rubik({ subsets: ['latin', 'cyrillic', 'cyrillic-ext'], variable: '--font-rubik', display: 'swap', preload: false });

export const fontVariables = [onest, playfair, interTight, cormorant, literata, unbounded, rubik]
  .map((f) => f.variable)
  .join(' ');
