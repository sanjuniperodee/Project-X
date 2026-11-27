import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fontkit from 'fontkit';
import type { FontKey } from '../domain/document';
import type { FontMetrics } from '../domain/text';

/**
 * Brand typefaces (SIL Open Font License, from Google Fonts via @expo-google-fonts).
 * The same families as the brand sites, see frontend/src/shared/ui/fonts.ts.
 * The build copies these files to dist/fonts (tsup.config.ts), so the release needs no node_modules.
 */
export const FONT_FILES: Record<FontKey, { package: string; file: string; fallback?: FontKey }> = {
  'playfair-400': { package: 'playfair-display', file: '400Regular/PlayfairDisplay_400Regular.ttf', fallback: 'literata-400' },
  'playfair-700': { package: 'playfair-display', file: '700Bold/PlayfairDisplay_700Bold.ttf', fallback: 'literata-600' },
  'playfair-italic': { package: 'playfair-display', file: '400Regular_Italic/PlayfairDisplay_400Regular_Italic.ttf', fallback: 'literata-italic' },
  'playfair-900': { package: 'playfair-display', file: '900Black/PlayfairDisplay_900Black.ttf', fallback: 'literata-600' },
  'playfair-900-italic': { package: 'playfair-display', file: '900Black_Italic/PlayfairDisplay_900Black_Italic.ttf', fallback: 'literata-italic' },
  'inter-400': { package: 'inter-tight', file: '400Regular/InterTight_400Regular.ttf' },
  'inter-600': { package: 'inter-tight', file: '600SemiBold/InterTight_600SemiBold.ttf' },
  'inter-700': { package: 'inter-tight', file: '700Bold/InterTight_700Bold.ttf' },
  'cormorant-600': { package: 'cormorant-garamond', file: '600SemiBold/CormorantGaramond_600SemiBold.ttf' },
  'cormorant-italic': { package: 'cormorant-garamond', file: '500Medium_Italic/CormorantGaramond_500Medium_Italic.ttf' },
  'literata-400': { package: 'literata', file: '400Regular/Literata_400Regular.ttf' },
  'literata-600': { package: 'literata', file: '600SemiBold/Literata_600SemiBold.ttf' },
  'literata-italic': { package: 'literata', file: '400Regular_Italic/Literata_400Regular_Italic.ttf' },
  // Unbounded has no Kazakh letters (ә, ғ, қ, ң, ө, ұ, ү, һ): those glyphs come from Rubik Bold.
  'unbounded-700': { package: 'unbounded', file: '700Bold/Unbounded_700Bold.ttf', fallback: 'rubik-700' },
  'rubik-400': { package: 'rubik', file: '400Regular/Rubik_400Regular.ttf' },
  'rubik-600': { package: 'rubik', file: '600SemiBold/Rubik_600SemiBold.ttf' },
  'rubik-700': { package: 'rubik', file: '700Bold/Rubik_700Bold.ttf' },
};

/** Where the bundled build keeps the fonts; in development they are read from node_modules. */
function locate(key: FontKey, fontsDir: string | undefined): string {
  const spec = FONT_FILES[key];
  if (!spec) throw new Error(`Unknown font "${key}"`);
  const fileName = path.basename(spec.file);
  const candidates = [
    fontsDir && path.join(fontsDir, fileName),
    fileURLToPath(new URL(`./fonts/${fileName}`, import.meta.url)),
  ].filter((p): p is string => Boolean(p));
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  return createRequire(import.meta.url).resolve(`@expo-google-fonts/${spec.package}/${spec.file}`);
}

interface LoadedFont {
  path: string;
  data: Buffer;
  font: fontkit.Font;
}

/**
 * Loads fonts lazily (a template uses 4–6 of them) and caches widths of repeated words.
 * Implements the typesetter's metrics; the renderers reuse the same fontkit objects, so
 * the glyph positions in the PDF and in the SVG previews come from one source.
 */
export class FontLibrary implements FontMetrics {
  private readonly loaded = new Map<FontKey, LoadedFont>();
  private readonly widths = new Map<string, number>();

  constructor(private readonly fontsDir?: string) {}

  get(key: FontKey): LoadedFont {
    let entry = this.loaded.get(key);
    if (!entry) {
      const file = locate(key, this.fontsDir);
      const data = readFileSync(file);
      const font = fontkit.create(data);
      entry = { path: file, data, font };
      this.loaded.set(key, entry);
    }
    return entry;
  }

  width(key: FontKey, text: string, size: number): number {
    const cacheKey = `${key}\u0000${text}`;
    let units = this.widths.get(cacheKey);
    if (units === undefined) {
      const { font } = this.get(key);
      units = font.layout(text).advanceWidth / font.unitsPerEm;
      if (this.widths.size > 50_000) this.widths.clear();
      this.widths.set(cacheKey, units);
    }
    return units * size;
  }

  covers(key: FontKey, codePoint: number): boolean {
    // Spaces and joiners are fine in any font.
    if (codePoint <= 0x20) return true;
    return this.get(key).font.hasGlyphForCodePoint(codePoint);
  }

  fallback(key: FontKey): FontKey | null {
    return FONT_FILES[key]?.fallback ?? null;
  }

  ascent(key: FontKey, size: number): number {
    const { font } = this.get(key);
    return (font.ascent / font.unitsPerEm) * size;
  }

  descent(key: FontKey, size: number): number {
    const { font } = this.get(key);
    return (Math.abs(font.descent) / font.unitsPerEm) * size;
  }

  /** Keys actually loaded, e.g. to report memory use. */
  keys(): FontKey[] {
    return [...this.loaded.keys()];
  }
}
