import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { MediaRef } from '@px/contracts';
import type { PhotoRef } from '../domain/document';
import { mediaKey } from '../domain/materials';
import type { PhotoLibrary } from '../templates';
import type { ImageProcessor, MediaGateway } from './ports';

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
    private readonly deps: { media: MediaGateway; images: ImageProcessor; dir: string; thumbnailSize: number },
  ) {}

  async prepare(refs: MediaRef[]): Promise<void> {
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
      this.photos.set(key, { key, width: info.width, height: info.height, file });
      const thumbnail = await this.thumbnail(key, data);
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
    return photo ? { key: photo.key, width: photo.width, height: photo.height } : undefined;
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
