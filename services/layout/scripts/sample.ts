/**
 * Renders sample layouts of every product with generated photos into a folder, for eyeballing
 * templates: `npm run sample -- /tmp/px-samples`. Prints time and peak memory per product.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Draft, LayoutSource, Product } from '@px/contracts';
import { LayoutService } from '../src/application/layout-service';
import { collectPhotos, mediaKey } from '../src/domain/materials';
import { createRenderer, imageProcessor } from '../src/infrastructure/adapters';
import { FontLibrary } from '../src/infrastructure/fonts';
import { InMemoryEventBus } from '@px/service-kit/testing';
import * as f from '../test/fixtures/materials';

const out = process.argv[2] ?? '/tmp/px-samples';
await mkdir(out, { recursive: true });
const fonts = new FontLibrary();
const renderer = createRenderer(fonts);

const cases: Array<[string, Product, LayoutSource, Draft]> = [
  ['glossy', f.products.glossy, f.glossySource(), f.glossyDraft],
  ['shezhire', f.products.shezhire, f.shezhireSource(), f.shezhireDraft],
  ['boardgame', f.products.boardgame, f.boardgameSource(), f.boardgameDraft],
];
for (const [name, product, source, draft] of cases) {
  const keys = collectPhotos(product, source.answers, source.contributions).map((r) => mediaKey(r)!.replace('.jpg', ''));
  const media = new f.FakeMedia(f.photoFiles(keys));
  const service = new LayoutService({
    projects: { layoutSource: async () => source },
    catalog: { product: async () => product },
    media, images: imageProcessor, renderer, fonts,
    bus: new InMemoryEventBus(), log: console as never, tmpDir: out, thumbnailSize: 640,
  });
  const started = Date.now();
  const rendered = await service.render(product, source, draft);
  const dir = path.join(out, name);
  await mkdir(dir, { recursive: true });
  const { copyFile } = await import('node:fs/promises');
  await copyFile(rendered.pdfFile, path.join(dir, 'layout.pdf'));
  for (const [i, page] of rendered.document.pages.entries()) {
    await writeFile(path.join(dir, `p${String(i + 1).padStart(2, '0')}-${page.kind}.svg`), renderer.svg(page, { thumbnail: (k) => rendered.photos.thumbnailOf(k) }));
  }
  console.log(name, { pages: rendered.document.pages.length, kinds: rendered.document.pages.map((p) => p.kind).join(','), warnings: rendered.warnings, ms: Date.now() - started, pdfKb: Math.round(rendered.pdfBytes / 1024) });
}
