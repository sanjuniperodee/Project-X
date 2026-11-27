/** The parts of fontkit 3 and png-js 3 this service uses (neither ships type declarations). */
declare module 'fontkit' {
  export interface Path {
    commands: unknown[];
    toSVG(): string;
  }
  export interface Glyph {
    id: number;
    path: Path;
  }
  export interface GlyphPosition {
    xAdvance: number;
    yAdvance: number;
    xOffset: number;
    yOffset: number;
  }
  export interface GlyphRun {
    glyphs: Glyph[];
    positions: GlyphPosition[];
    advanceWidth: number;
  }
  export interface Font {
    unitsPerEm: number;
    ascent: number;
    descent: number;
    capHeight: number;
    layout(text: string, features?: string[]): GlyphRun;
    hasGlyphForCodePoint(codePoint: number): boolean;
  }
  export function create(data: Uint8Array, postscriptName?: string): Font;
}

declare module 'png-js' {
  export default class PNG {
    constructor(data: Uint8Array);
    width: number;
    height: number;
    /** RGBA pixels. */
    decode(): Promise<Uint8Array>;
  }
}
