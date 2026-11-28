import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { MediaRef } from '@px/contracts';
import type { PhotoRef } from '../domain/document';
import { mediaKey } from '../domain/materials';
import type { PhotoLibrary } from '../templates';
import type { ImageProcessor, MediaGateway, PortraitFinder } from './ports';

/**
 * Downloads the project's photos into a working directory, reads their size and
 * orientation, and prepares preview thumbnails (cached in media, so revisions reuse them).
 * Photos are handled one at a time to keep memory flat on a small shared server.
 */
export class PhotoStore implements PhotoLibrary {
  private readonly photos = new Map<string, PhotoRef & { file: string }>();
  private readonly thumbnails = new Map<string, Buffer>();
  readonly warnings: string[] = [];

  constructor(
    private readonly deps: { media: MediaGateway; images: ImageProcessor; portraits: PortraitFinder; dir: string; thumbnailSize: number },
  ) {}

  /** Downloads `refs`; for those in `portraits` (photos a template may cut out) also traces the person. */
  async prepare(refs: MediaRef[], portraits: MediaRef[] = []): Promise<void> {
    const cutouts = new Set(portraits.map((ref) => mediaKey(ref)));
    // Portraits first, then the tracer is released before the other photos are read: its memory
    // never adds up with the rest of the layout.
    const first = refs.filter((ref) => cutouts.has(mediaKey(ref)));
    try {
      await this.load(first, cutouts);
    } finally {
      await this.deps.portraits.release?.();
    }
    await this.load(refs.filter((ref) => !first.includes(ref)), new Set());
  }

  private async load(refs: MediaRef[], cutouts: Set<string | null>): Promise<void> {
    const skipped: Record<string, number> = {};
    for (const ref of refs) {
      const key = mediaKey(ref);
      if (!key || this.photos.has(key)) continue;
      const file = path.join(this.deps.dir, key);
      if (!(await this.deps.media.download(key, file))) {
        skipped.missing = (skipped.missing ?? 0) + 1;
        continue;
      }
      const data = await readFile(file);
      const info = this.deps.images.probe(data);
      if (info.type !== 'jpeg' && info.type !== 'png') {
        skipped[info.type] = (skipped[info.type] ?? 0) + 1;
        continue;
      }
      const thumbnail = await this.thumbnail(key, data);
      const vivid = thumbnail ? this.deps.images.vividColor(thumbnail) : undefined;
      const silhouette = thumbnail && cutouts.has(key) ? await this.traceSilhouette(key, thumbnail) : null;
      this.photos.set(key, { key, width: info.width, height: info.height, file, ...(vivid ? { vivid } : {}), ...(silhouette ? { silhouette } : {}) });
      if (thumbnail) this.thumbnails.set(key, thumbnail);
    }
    const labels: Record<string, string> = { heic: 'HEIC', webp: 'WebP', unknown: 'неизвестного формата', missing: 'не найдено в хранилище' };
    for (const [type, count] of Object.entries(skipped)) {
      this.warnings.push(
        type === 'missing'
          ? `${count} фото не найдено в хранилище и не вошло в макет`
          : `${count} фото в формате ${labels[type] ?? type} не вошло в макет: нужен JPEG или PNG`,
      );
    }
  }

  get(ref: MediaRef): PhotoRef | undefined {
    const key = mediaKey(ref);
    const photo = key ? this.photos.get(key) : undefined;
    if (!photo) return undefined;
    const { file: _file, ...placeable } = photo;
    return placeable;
  }

  file(key: string): string | undefined {
    return this.photos.get(key)?.file;
  }

  thumbnailOf(key: string): Buffer | undefined {
    return this.thumbnails.get(key);
  }

  get count(): number {
    return this.photos.size;
  }

  private async traceSilhouette(key: string, thumbnail: Buffer) {
    try {
      return await this.deps.portraits.silhouette(thumbnail);
    } catch (error) {
      this.warnings.push(`Не удалось вырезать человека на фото ${key}: обложка без эффекта глубины (${(error as Error).message})`);
      return null;
    }
  }

  private async thumbnail(key: string, data: Buffer): Promise<Buffer | null> {
    const cacheKey = `thumb${this.deps.thumbnailSize}_${key.replace(/\.[a-z0-9]+$/, '')}.jpg`;
    const cached = await this.deps.media.get(cacheKey).catch(() => null);
    if (cached) return cached;
    try {
      const { data: jpeg } = await this.deps.images.thumbnail(data, this.deps.thumbnailSize);
      await this.deps.media.put(cacheKey, jpeg, 'image/jpeg').catch(() => undefined);
      return jpeg;
    } catch {
      this.warnings.push(`Не удалось сделать превью фото ${key}: в превью страницы на его месте серый блок`);
      return null;
    }
  }
}
