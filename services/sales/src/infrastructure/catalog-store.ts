import { AppError } from '@px/service-kit';
import { eq, sql } from 'drizzle-orm';
import type { CatalogStore, MediaReader, WaProductRow } from '../application/ports';
import type { Database } from './db/client';
import { catalogPhotos, waProducts } from './db/schema';

export class DrizzleCatalogStore implements CatalogStore {
  constructor(private readonly db: Database) {}

  async photos() {
    return this.db.select().from(catalogPhotos);
  }

  async setPhotos(productId: string, images: string[]) {
    await this.db
      .insert(catalogPhotos)
      .values({ productId, images })
      .onConflictDoUpdate({
        target: catalogPhotos.productId,
        set: { images, version: sql`${catalogPhotos.version} + 1`, updatedAt: new Date() },
      });
  }

  async markPhotosSynced(rows: { productId: string; version: number }[]) {
    for (const r of rows) {
      await this.db.update(catalogPhotos).set({ syncedVersion: r.version }).where(eq(catalogPhotos.productId, r.productId));
    }
  }

  async replaceProducts(rows: Omit<WaProductRow, 'syncedAt'>[]) {
    await this.db.transaction(async (tx) => {
      await tx.delete(waProducts);
      if (rows.length) await tx.insert(waProducts).values(rows.map((r) => ({ ...r, syncedAt: new Date() })));
    });
  }

  async products() {
    return this.db.select().from(waProducts);
  }
}

/** Uploaded photos come from the media service on the private network (public path /api/media/files/<key>). */
export class HttpMediaReader implements MediaReader {
  constructor(private readonly mediaUrl: string) {}

  async read(publicUrl: string) {
    const key = /^\/api\/media\/files\/([A-Za-z0-9_-]+\.(jpg|jpeg|png|webp))$/.exec(publicUrl)?.[1];
    if (!key) throw AppError.badRequest(`Фото для каталога: только JPEG, PNG или WebP (${publicUrl})`);
    let res: Response;
    try {
      res = await fetch(`${this.mediaUrl.replace(/\/$/, '')}/files/${key}`, { signal: AbortSignal.timeout(30_000) });
    } catch {
      throw new AppError('unavailable', 'Сервис фото недоступен');
    }
    if (!res.ok) throw AppError.notFound(`Фото ${key}`);
    const data = new Uint8Array(await res.arrayBuffer());
    if (data.length > 8 * 1024 * 1024) throw AppError.badRequest('Фото больше 8 МБ — WhatsApp его не примет');
    return { data, name: key, mime: res.headers.get('content-type') ?? 'image/jpeg' };
  }
}
