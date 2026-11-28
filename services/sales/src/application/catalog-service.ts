import type { CatalogStatus, ProductId } from '@px/contracts';
import { AppError, type Logger } from '@px/service-kit';
import { catalogLink, NO_CATALOG, planCatalog, retailerIdOf, wantedProducts, type WaProduct } from '../domain/catalog';
import type { Links } from '../domain/links';
import type { CatalogGatewayWa, CatalogStore, CatalogGateway, MediaReader, WhatsAppGateway } from './ports';

const REVIEW: Record<string, CatalogStatus['items'][number]['review']> = {
  APPROVED: 'approved',
  PENDING: 'pending',
  REJECTED: 'rejected',
  OUTDATED: 'outdated',
};

export interface CatalogDeps {
  store: CatalogStore;
  /** null: the gateway is not configured (development). */
  wa: CatalogGatewayWa | null;
  whatsapp: WhatsAppGateway;
  catalog: CatalogGateway;
  media: MediaReader;
  links: Links;
  log: Logger;
}

/**
 * Our product formats as products of the studio's WhatsApp Business catalog, so the AI seller can send real
 * product cards (photo, price, "add to cart") instead of plain text.
 */
export class CatalogService {
  private syncing: Promise<unknown> | null = null;

  constructor(private readonly deps: CatalogDeps) {}

  async status(): Promise<CatalogStatus> {
    const { store, catalog, whatsapp, links } = this.deps;
    const [products, photos, copy, wa] = await Promise.all([catalog.products(), store.photos(), store.products(), whatsapp.status()]);
    const wanted = wantedProducts(products, (id) => links.brand(id));
    const experience = this.deps.wa && wa.loggedIn && wa.phone ? await this.deps.wa.commerceExperience(wa.phone).catch(() => null) : null;
    const byRetailer = new Map(copy.map((p) => [p.retailerId, p]));
    const photoOf = new Map(photos.map((p) => [p.productId, p]));
    return {
      available: !!this.deps.wa && wa.loggedIn,
      problem: !this.deps.wa
        ? 'WhatsApp не настроен'
        : !wa.loggedIn
          ? 'Номер WhatsApp не привязан'
          : experience && experience !== 'catalog'
            ? NO_CATALOG
            : null,
      catalogUrl: wa.phone ? catalogLink(wa.phone) : null,
      lastSyncAt: copy.length ? new Date(Math.max(...copy.map((p) => p.syncedAt.getTime()))).toISOString() : null,
      products: products.map((p) => {
        const row = photoOf.get(p.id);
        return { productId: p.id, productName: p.name, images: row?.images ?? [], pending: !!row && row.version !== row.syncedVersion };
      }),
      items: wanted.map((w) => {
        const have = byRetailer.get(w.retailerId);
        return {
          productId: w.productId,
          formatId: w.formatId,
          name: w.name,
          price: w.price,
          waProductId: have?.id ?? null,
          review: have ? (REVIEW[have.review] ?? 'unknown') : 'none',
          outdated: !!have && (have.name !== w.name || have.price !== w.price || have.url !== w.url || have.description !== w.description),
        };
      }),
    };
  }

  async setPhotos(productId: ProductId, images: string[]) {
    await this.deps.store.setPhotos(productId, images);
    return this.status();
  }

  /** One sync at a time: a second click waits for the running one. */
  sync() {
    this.syncing ??= this.runSync().finally(() => (this.syncing = null));
    return this.syncing as ReturnType<CatalogService['runSync']>;
  }

  private async runSync() {
    const { wa, store, catalog, links, media, log } = this.deps;
    if (!wa) throw AppError.conflict('WhatsApp не настроен');
    const [products, photos, current] = await Promise.all([catalog.products(), store.photos(), wa.products()]);
    const photoOf = new Map(photos.map((p) => [p.productId, p]));
    const wanted = wantedProducts(products, (id) => links.brand(id));
    const plan = planCatalog(current, wanted, (id) => {
      const row = photoOf.get(id);
      return !!row && row.version !== row.syncedVersion;
    });

    // Photos are uploaded once per product and shared by its formats.
    const uploaded = new Map<string, string[]>();
    const imagesFor = async (productId: ProductId) => {
      if (!uploaded.has(productId)) {
        const files = await Promise.all((photoOf.get(productId)?.images ?? []).map((url) => media.read(url)));
        uploaded.set(productId, await wa.uploadImages(files));
      }
      return uploaded.get(productId)!;
    };

    const skipped: string[] = [];
    let created = 0;
    let updated = 0;
    for (const w of plan.create) {
      const images = await imagesFor(w.productId);
      if (!images.length) {
        skipped.push(`${w.name}: нет фото — WhatsApp не принимает товар без фото`);
        continue;
      }
      await wa.create(w, images);
      created++;
    }
    for (const u of plan.update) {
      const images = u.keepImages.length ? u.keepImages : await imagesFor(u.wanted.productId);
      if (!images.length) {
        skipped.push(`${u.wanted.name}: нет фото`);
        continue;
      }
      await wa.edit(u.id, u.wanted, images);
      updated++;
    }
    await wa.remove(plan.remove.map((p) => p.id));

    const fresh = await wa.products();
    await store.replaceProducts(fresh.filter((p) => p.retailerId.startsWith('px:')).map(toRow));
    await store.markPhotosSynced(
      photos.filter((p) => uploaded.has(p.productId) && (uploaded.get(p.productId)?.length ?? 0) > 0).map((p) => ({ productId: p.productId, version: p.version })),
    );
    log.info({ created, updated, removed: plan.remove.length, skipped: skipped.length }, 'whatsapp catalog synced');
    return { created, updated, removed: plan.remove.length, unchanged: plan.unchanged.length, skipped, status: await this.status() };
  }

  /** The approved WhatsApp product for a format, or null (not synced, in review, rejected). */
  async cardFor(productId: string, formatId: string) {
    const row = (await this.deps.store.products()).find((p) => p.retailerId === retailerIdOf(productId, formatId));
    return row && row.review === 'APPROVED' ? row : null;
  }

  async approvedCards() {
    return (await this.deps.store.products()).filter((p) => p.review === 'APPROVED');
  }
}

function toRow(p: WaProduct) {
  return {
    id: p.id,
    retailerId: p.retailerId,
    name: p.name,
    description: p.description,
    price: p.price === null ? null : Math.round(p.price),
    url: p.url,
    review: p.review,
    imageUrl: p.imageUrls[0] ?? null,
    imageCount: p.imageUrls.length,
  };
}
