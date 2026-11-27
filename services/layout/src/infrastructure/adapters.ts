import type { ImageProcessor, Renderer } from '../application/ports';
import type { FontLibrary } from './fonts';
import { probe, thumbnail, vividColorOf } from './images';
import { renderPdf } from './pdf-renderer';
import { renderSvg } from './svg-renderer';

export const imageProcessor: ImageProcessor = { probe, thumbnail, vividColor: vividColorOf };

export function createRenderer(fonts: FontLibrary): Renderer {
  return {
    pdf: (document, file, options) => renderPdf(document, fonts, file, options),
    svg: (page, options) => renderSvg(page, fonts, options),
  };
}
