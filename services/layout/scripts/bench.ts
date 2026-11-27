/**
 * Memory and time of one layout at realistic scale: `npm run bench -- [photos] [megapixels]`.
 * Renders a 36-page Cover Me with N phone-sized JPEGs (default 40 × 12 MP) and reports peak RSS.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import jpeg from 'jpeg-js';
import { InMemoryEventBus } from '@px/service-kit/testing';
import { LayoutService } from '../src/application/layout-service';
import { createRenderer, imageProcessor } from '../src/infrastructure/adapters';
import { FontLibrary } from '../src/infrastructure/fonts';
import * as f from '../test/fixtures/materials';

const count = Number(process.argv[2] ?? 40);
const megapixels = Number(process.argv[3] ?? 12);
const w = Math.round(Math.sqrt((megapixels * 1e6 * 4) / 3));
const h = Math.round((w * 3) / 4);

// A noisy photo-like image compresses like a real one (~3 MB at 12 MP).
function photo(seed: number): Buffer {
  const data = Buffer.alloc(w * h * 4);
  let x = seed * 9973 + 1;
  for (let i = 0; i < data.length; i += 4) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    const p = i / 4;
    data[i] = ((p % w) / w) * 200 + (x & 31);
    data[i + 1] = (p / w / h) * 200 + ((x >> 5) & 31);
    data[i + 2] = 90 + ((x >> 10) & 63);
    data[i + 3] = 255;
  }
  return jpeg.encode({ width: w, height: h, data }, 85).data;
}

const source = f.glossySource();
source.formatId = 'a4-36';
source.answers.photos = {
  cover: [{ id: 'b0', url: '/api/media/files/b0.jpg' }],
  gallery: Array.from({ length: count - 1 }, (_, i) => ({ id: `b${i + 1}`, url: `/api/media/files/b${i + 1}.jpg` })),
};
source.contributions = source.contributions.map((c) => ({ ...c, answers: { insight: { ...c.answers.insight, photos: [] } } }));

// Sample photos are generated once into a cache folder by a separate run, so that the peak
// memory of this process (maxRSS) reflects rendering only, as in production where media streams files.
const cache = path.join(tmpdir(), `px-bench-photos-${megapixels}mp`);
if (!existsSync(path.join(cache, 'ready'))) {
  mkdirSync(cache, { recursive: true });
  for (let i = 0; i < 3; i++) writeFileSync(path.join(cache, `s${i}.jpg`), photo(i + 1));
  writeFileSync(path.join(cache, 'ready'), '');
  console.log(`Sample photos written to ${cache}; run the benchmark again to measure.`);
  process.exit(0);
}
const sample = (key: string) => path.join(cache, `s${Number(key.replace(/\D/g, '')) % 3}.jpg`);
const media = new f.FakeMedia();
media.download = async (key, file) => (await copyFile(sample(key), file), true);
media.get = async (key) => (key.startsWith('b') ? readFile(sample(key)) : null);
media.put = async (key) => `/api/media/files/${key}`;
console.log(`${count} photos, ${w}×${h}, ${((await readFile(sample('b0'))).length / 1024 / 1024).toFixed(1)} MB each`);
const baseline = process.resourceUsage().maxRSS * 1024;

const fonts = new FontLibrary();
const dir = await mkdtemp(path.join(tmpdir(), 'px-bench-'));
const service = new LayoutService({
  projects: { layoutSource: async () => source },
  catalog: { product: async () => f.products.glossy },
  media, images: imageProcessor, renderer: createRenderer(fonts), fonts,
  bus: new InMemoryEventBus(), log: console as never, tmpDir: dir, thumbnailSize: 640,
});
const started = Date.now();
const rendered = await service.render(f.products.glossy, source, f.glossyDraft);
const renderMs = Date.now() - started;
const svgStarted = Date.now();
const renderer = createRenderer(fonts);
let svgBytes = 0;
for (const page of rendered.document.pages) svgBytes += renderer.svg(page, { thumbnail: (k) => rendered.photos.thumbnailOf(k) }).length;
const peak = process.resourceUsage().maxRSS * 1024;
console.log({
  pages: rendered.document.pages.length,
  renderSeconds: renderMs / 1000,
  previewSeconds: (Date.now() - svgStarted) / 1000,
  pdfMb: +(rendered.pdfBytes / 1024 / 1024).toFixed(1),
  previewsMb: +(svgBytes / 1024 / 1024).toFixed(1),
  startupRssMb: Math.round(baseline / 1024 / 1024),
  peakRssMb: Math.round(peak / 1024 / 1024),
});
await rm(rendered.workdir, { recursive: true, force: true });
await rm(dir, { recursive: true, force: true });
