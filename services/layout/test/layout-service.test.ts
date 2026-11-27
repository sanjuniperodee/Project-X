import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { LayoutSource } from '@px/contracts';
import { InMemoryEventBus } from '@px/service-kit/testing';
import { AppError } from '@px/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildLayoutApp } from '../src/app';
import type { CatalogGateway } from '../src/application/ports';
import { collectPhotos, mediaKey } from '../src/domain/materials';
import * as f from './fixtures/materials';

let dir = '';
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'px-layout-test-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function setup(
  source: LayoutSource | (() => Promise<LayoutSource>),
  media = mediaFor(f.glossySource()),
  catalog: CatalogGateway = { product: async (id) => f.products[id] },
) {
  const bus = new InMemoryEventBus();
  const app = await buildLayoutApp({
    connectBus: async () => bus,
    projects: { layoutSource: typeof source === 'function' ? source : async () => source },
    catalog,
    media,
    tmpDir: dir,
    thumbnailSize: 200,
    logLevel: 'silent',
  });
  return { bus, media };
}

function mediaFor(source: LayoutSource) {
  const product = f.products[source.productId];
  const keys = collectPhotos(product, source.answers, source.contributions).map((ref) => mediaKey(ref)!.replace('.jpg', ''));
  return new f.FakeMedia(f.photoFiles(keys, [300, 400]));
}

const draftEvent = (projectId: string) => ({ projectId, generator: 'claude:test', draft: { title: f.glossyDraft.title, lead: f.glossyDraft.lead, sections: f.glossyDraft.sections, cards: f.glossyDraft.cards } });

describe('layout worker', () => {
  it('turns a generated draft into a stored PDF with page previews and publishes layout.generated', async () => {
    const source = { ...f.glossySource(), nextVersion: 3 };
    const { bus, media } = await setup(source);
    await bus.publish('ai.draft_generated', draftEvent(source.projectId));
    await bus.drain();

    const event = bus.published.find((e) => e.type === 'layout.generated');
    expect(event?.data).toMatchObject({ projectId: source.projectId, version: 3, template: 'glossy-magazine@1' });
    const data = event!.data as { pdfUrl: string; pages: Array<{ previewUrl: string; kind: string; widthMm: number }> };
    expect(data.pages).toHaveLength(24);
    expect(data.pages[0]).toMatchObject({ kind: 'cover', widthMm: 210 });

    const pdf = media.files.get(data.pdfUrl.split('/').pop()!)!;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1')).toContain('/TrimBox');
    const svg = media.files.get(data.pages[0]!.previewUrl.split('/').pop()!)!.toString();
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).toContain('data:image/jpeg;base64,');
    expect(svg).not.toMatch(/<script|<foreignObject|https?:\/\/(?!www\.w3\.org)/);
    // Thumbnails are cached in media for the next version.
    expect([...media.stored.keys()].some((k) => k.startsWith('thumb200_'))).toBe(true);
    // Working files are removed.
    expect(await readdir(dir)).toEqual([]);
  });

  it('skips projects that are no longer waiting for an automatic layout', async () => {
    const { bus } = await setup({ ...f.glossySource(), designMode: 'studio' });
    await bus.publish('ai.draft_generated', draftEvent('p-glossy'));
    await bus.drain();
    expect(bus.published.map((e) => e.type)).toEqual(['ai.draft_generated']);
  });

  it('warns about photos it cannot print instead of failing', async () => {
    const source = f.glossySource();
    const media = mediaFor(source);
    media.files.set('g3.jpg', Buffer.from('....ftypheic........'));
    media.files.delete('g4.jpg');
    const { bus } = await setup(source, media);
    await bus.publish('ai.draft_generated', draftEvent(source.projectId));
    await bus.drain();
    const warnings = (bus.published.find((e) => e.type === 'layout.generated')!.data as { warnings: string[] }).warnings;
    expect(warnings).toEqual(expect.arrayContaining([expect.stringMatching(/HEIC/), expect.stringMatching(/не найдено/)]));
  });

  it('retries failures and reports layout.failed after the last attempt', async () => {
    let attempts = 0;
    const failing: CatalogGateway = {
      product: async () => {
        attempts++;
        throw new Error('boom');
      },
    };
    const { bus } = await setup(f.glossySource(), undefined, failing);
    await bus.publish('ai.draft_generated', draftEvent('p-glossy'));
    await bus.drain();
    expect(attempts).toBe(5);
    const failed = bus.published.filter((e) => e.type === 'layout.failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]!.data).toMatchObject({ projectId: 'p-glossy', version: 1, reason: 'boom' });
  });

  it('reports layout.failed even when the project cannot be loaded', async () => {
    const { bus } = await setup(async () => {
      throw AppError.unavailable('projects down');
    });
    await bus.publish('ai.draft_generated', draftEvent('p-glossy'));
    await bus.drain();
    expect(bus.published.find((e) => e.type === 'layout.failed')?.data).toEqual({ projectId: 'p-glossy', reason: 'projects down' });
  });

  it('ignores drafts of projects that no longer exist', async () => {
    const { bus } = await setup(async () => {
      throw AppError.notFound('Проект');
    });
    await bus.publish('ai.draft_generated', draftEvent('gone'));
    await bus.drain();
    expect(bus.published.map((e) => e.type)).toEqual(['ai.draft_generated']);
  });
});
