import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Draft, EventEnvelope, LayoutPage, LayoutSource, Product } from '@px/contracts';
import { AppError, type DeliveryInfo, type EventBus, type Logger } from '@px/service-kit';
import { toMm, type LayoutDocument } from '../domain/document';
import { collectPhotos, Materials } from '../domain/materials';
import type { FontMetrics } from '../domain/text';
import { TEMPLATES } from '../templates';
import { PhotoStore } from './photo-store';
import type { CatalogGateway, ImageProcessor, MediaGateway, PortraitFinder, ProjectsGateway, Renderer } from './ports';

export interface LayoutServiceDeps {
  projects: ProjectsGateway;
  catalog: CatalogGateway;
  media: MediaGateway;
  images: ImageProcessor;
  portraits: PortraitFinder;
  renderer: Renderer;
  fonts: FontMetrics;
  bus: EventBus;
  log: Logger;
  /** Working directory for downloaded photos and the PDF being written. */
  tmpDir: string;
  /** Longest side of preview thumbnails, in pixels. */
  thumbnailSize: number;
}

export interface RenderedLayout {
  document: LayoutDocument;
  pdfFile: string;
  pdfBytes: number;
  warnings: string[];
  workdir: string;
  photos: PhotoStore;
}

/** Use cases of the layout service: typeset a project, render the PDF and previews, publish the result. */
export class LayoutService {
  constructor(private readonly deps: LayoutServiceDeps) {}

  /** `ai.draft_generated` → `layout.generated` (or `layout.failed` after the last retry). */
  async handleDraftGenerated(event: EventEnvelope<'ai.draft_generated'>, delivery: DeliveryInfo): Promise<void> {
    const { projectId } = event.data;
    let source: LayoutSource | undefined;
    let rendered: RenderedLayout | undefined;
    const started = Date.now();
    try {
      try {
        source = await this.deps.projects.layoutSource(projectId);
      } catch (error) {
        if (error instanceof AppError && error.code === 'not_found') {
          this.deps.log.warn({ projectId }, 'Project not found, layout skipped');
          return;
        }
        throw error;
      }
      if (source.status !== 'in_design' || source.designMode !== 'auto') {
        this.deps.log.info({ projectId, status: source.status, mode: source.designMode }, 'Project is not waiting for an automatic layout, skipped');
        return;
      }

      const draft: Draft = { ...event.data.draft, generator: event.data.generator, generatedAt: event.occurredAt };
      const product = await this.deps.catalog.product(source.productId);
      rendered = await this.render(product, source, draft);
      const files = await this.publishFiles(rendered, source);
      await this.deps.bus.publish('layout.generated', {
        projectId,
        version: source.nextVersion,
        pdfUrl: files.pdfUrl,
        pages: files.pages,
        template: rendered.document.template,
        warnings: rendered.warnings,
      });
      this.deps.log.info(
        {
          projectId,
          version: source.nextVersion,
          pages: files.pages.length,
          photos: rendered.photos.count,
          pdfBytes: rendered.pdfBytes,
          ms: Date.now() - started,
          rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        },
        'Layout generated',
      );
    } catch (error) {
      if (delivery.attempt < delivery.maxAttempts) throw error;
      // Out of retries: hand the project to the studio rather than leave it waiting.
      this.deps.log.error({ err: error, projectId }, 'Layout failed on the last attempt, handing over to the studio');
      await this.deps.bus.publish('layout.failed', {
        projectId,
        ...(source ? { version: source.nextVersion } : {}),
        reason: error instanceof Error ? error.message.slice(0, 500) : String(error),
      });
    } finally {
      if (rendered) await rm(rendered.workdir, { recursive: true, force: true });
    }
  }

  /** Typesets and renders the print PDF into a temporary directory (the caller removes `workdir`). */
  async render(product: Product, source: LayoutSource, draft: Draft): Promise<RenderedLayout> {
    const workdir = await mkdtemp(path.join(this.deps.tmpDir, 'px-layout-'));
    try {
      const template = TEMPLATES[product.id];
      const photos = new PhotoStore({
        media: this.deps.media,
        images: this.deps.images,
        portraits: this.deps.portraits,
        dir: workdir,
        thumbnailSize: this.deps.thumbnailSize,
      });
      const portraits = template.portraits?.(new Materials(product, source.answers)) ?? [];
      await photos.prepare(collectPhotos(product, source.answers, source.contributions), portraits);

      const document = template.build({ product, source, draft, photos }, this.deps.fonts);
      if (document.pages.length === 0) throw new Error(`Template ${template.id} produced no pages`);

      const pdfFile = path.join(workdir, 'layout.pdf');
      await this.deps.renderer.pdf(document, pdfFile, { photoPath: (key) => photos.file(key), author: product.name });
      const { size } = await stat(pdfFile);
      return { document, pdfFile, pdfBytes: size, warnings: [...photos.warnings, ...document.warnings], workdir, photos };
    } catch (error) {
      await rm(workdir, { recursive: true, force: true });
      throw error;
    }
  }

  private async publishFiles(rendered: RenderedLayout, source: LayoutSource): Promise<{ pdfUrl: string; pages: LayoutPage[] }> {
    // Random part: layout files are public by URL like photos, so names must not be guessable.
    const base = `layout_${randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x')}_v${source.nextVersion}`;
    const pdfUrl = await this.deps.media.put(`${base}.pdf`, { file: rendered.pdfFile }, 'application/pdf');
    const pages: LayoutPage[] = [];
    for (const [index, page] of rendered.document.pages.entries()) {
      const svg = this.deps.renderer.svg(page, { thumbnail: (key) => rendered.photos.thumbnailOf(key) });
      const number = index + 1;
      const previewUrl = await this.deps.media.put(`${base}_p${String(number).padStart(3, '0')}.svg`, Buffer.from(svg), 'image/svg+xml');
      pages.push({ number, kind: page.kind, widthMm: toMm(page.size.w), heightMm: toMm(page.size.h), previewUrl });
    }
    return { pdfUrl, pages };
  }
}
