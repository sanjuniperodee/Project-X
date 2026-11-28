import { formatTenge, type Product, type ProductId } from '@px/contracts';

/**
 * WhatsApp Business catalog of the studio number (protocol as in MyBooks / DoseWear, docs there: whatsapp-catalog.md).
 * Pure rules: what our catalog should look like in WhatsApp, the GraphQL shapes, inbound product and cart cards.
 */

export const CATALOG_CURRENCY = 'KZT';
/** WhatsApp keeps prices in thousandths: 25 000 ₸ → "25000000". */
export const toWaPrice = (price: number) => Math.round(price * 1000);
export const CATALOG_LIMITS = { name: 150, description: 5000, images: 10, imageBytes: 8 * 1024 * 1024 } as const;

export interface WaProduct {
  id: string;
  name: string;
  description: string;
  price: number | null;
  currency: string;
  retailerId: string;
  url: string;
  hidden: boolean;
  imageUrls: string[];
  /** WhatsApp review: APPROVED, PENDING, REJECTED, OUTDATED… */
  review: string;
}

/** What one of our formats should be in WhatsApp. One WhatsApp product per product format. */
export interface WantedProduct {
  retailerId: string;
  productId: ProductId;
  formatId: string;
  name: string;
  description: string;
  price: number;
  url: string;
}

/** Our products have stable ids: `px:<productId>:<formatId>` marks the products this service manages. */
export const retailerIdOf = (productId: string, formatId: string) => `px:${productId}:${formatId}`;

export function parseRetailerId(retailerId: string): { productId: string; formatId: string } | null {
  const m = /^px:([a-z]+):([A-Za-z0-9_-]+)$/.exec(retailerId);
  return m ? { productId: m[1]!, formatId: m[2]! } : null;
}

export function wantedProducts(products: Product[], brandUrl: (id: ProductId) => string): WantedProduct[] {
  return products.flatMap((p) =>
    p.formats.map((f) => ({
      retailerId: retailerIdOf(p.id, f.id),
      productId: p.id,
      formatId: f.id,
      name: `${p.name} — ${f.name}`.slice(0, CATALOG_LIMITS.name),
      description: [p.tagline, f.description, `Предоплата ${formatTenge(p.deposit)}, остаток после согласования макета.`]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, CATALOG_LIMITS.description),
      price: f.price,
      url: brandUrl(p.id),
    })),
  );
}

export interface CatalogPlan {
  create: WantedProduct[];
  update: { id: string; wanted: WantedProduct; keepImages: string[] }[];
  remove: WaProduct[];
  unchanged: { id: string; wanted: WantedProduct }[];
}

/**
 * Minimal set of changes: every edit sends the product back to WhatsApp review, so only real differences are edited.
 * Products without our retailer id (added by hand in the app) are left alone.
 */
export function planCatalog(current: WaProduct[], wanted: WantedProduct[], imagesChanged: (productId: ProductId) => boolean): CatalogPlan {
  const byRetailer = new Map(current.filter((p) => parseRetailerId(p.retailerId)).map((p) => [p.retailerId, p]));
  const plan: CatalogPlan = { create: [], update: [], remove: [], unchanged: [] };
  for (const w of wanted) {
    const have = byRetailer.get(w.retailerId);
    byRetailer.delete(w.retailerId);
    if (!have) {
      plan.create.push(w);
      continue;
    }
    const same = have.name === w.name && have.description === w.description && have.price === w.price && have.url === w.url && !have.hidden;
    if (same && !imagesChanged(w.productId)) plan.unchanged.push({ id: have.id, wanted: w });
    else plan.update.push({ id: have.id, wanted: w, keepImages: imagesChanged(w.productId) ? [] : have.imageUrls });
  }
  plan.remove = [...byRetailer.values()];
  return plan;
}

/** product_info of the add / edit mutations. */
export function productInfo(w: WantedProduct, imageUrls: string[]): Record<string, unknown> {
  return {
    name: w.name,
    description: w.description,
    url: w.url,
    retailer_id: w.retailerId,
    is_hidden: false,
    currency: CATALOG_CURRENCY,
    price: String(toWaPrice(w.price)),
    media: { image: imageUrls.map((url) => ({ url })) },
  };
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(str(v));
  return Number.isFinite(n) ? n : 0;
};

export function parseGraphProduct(raw: unknown): WaProduct | null {
  const p = rec(raw);
  const id = str(p.id).trim();
  if (!/^\d{1,40}$/.test(id)) return null;
  const images = Array.isArray(rec(p.media).images) ? (rec(p.media).images as unknown[]).map(rec) : [];
  const price = num(p.price);
  return {
    id,
    name: str(p.name),
    description: str(p.description),
    price: price > 0 ? price / 1000 : null,
    currency: str(p.currency) || CATALOG_CURRENCY,
    retailerId: str(p.retailer_id),
    url: str(p.url),
    hidden: p.is_hidden === true || /TRUE$/i.test(str(p.is_hidden)),
    imageUrls: images.map((i) => str(i.original_image_url) || str(i.request_image_url)).filter(Boolean),
    review: str(rec(p.status_info).status).toUpperCase(),
  };
}

export function graphError(body: unknown): string | null {
  const b = rec(body);
  const one = rec(b.error);
  if (Object.keys(one).length) return str(one.error_user_msg) || str(one.message) || `код ${str(one.code)}`;
  const many = Array.isArray(b.errors) ? b.errors.map(rec) : [];
  if (many.length) return many.map((e) => str(e.description) || str(e.summary) || str(e.message) || `код ${str(e.code)}`).join('; ');
  return null;
}

export const graphData = (body: unknown, field: string) => rec(rec(rec(body).data)[field]);

export type InboundCard =
  | { kind: 'product'; waProductId: string; name: string; price: number | null; retailerId: string | null }
  | { kind: 'order'; orderId: string; itemCount: number; total: number | null; note: string | null };

/** A product the customer forwarded / opened from our catalog, or a cart they sent. */
export function cardFromGowaPayload(payload: Record<string, unknown>): InboundCard | null {
  if ('product' in payload) {
    const p = rec(payload.product);
    const id = str(p.product_id);
    if (!id) return null;
    const price = num(p.sale_price_amount_1000) || num(p.price_amount_1000);
    return { kind: 'product', waProductId: id, name: str(p.title), price: price > 0 ? price / 1000 : null, retailerId: str(p.retailer_id) || null };
  }
  if ('order' in payload) {
    const o = rec(payload.order);
    const id = str(o.orderID ?? o.order_id);
    if (!id) return null;
    const total = num(o.totalAmount1000 ?? o.total_amount_1000);
    return { kind: 'order', orderId: id, itemCount: Math.max(0, Math.round(num(o.itemCount ?? o.item_count))), total: total > 0 ? total / 1000 : null, note: str(o.message) || null };
  }
  return null;
}

/** How a card reads in the chat history (for the model and /admin). */
export function cardText(card: InboundCard): string {
  if (card.kind === 'product') {
    const ours = card.retailerId ? parseRetailerId(card.retailerId) : null;
    const ref = ours ? ` (productId=${ours.productId}, formatId=${ours.formatId})` : '';
    return `[клиент открыл товар из каталога WhatsApp: «${card.name}»${card.price ? `, ${formatTenge(card.price)}` : ''}${ref}]`;
  }
  return `[клиент прислал корзину из каталога WhatsApp: ${card.itemCount || '?'} шт.${card.total ? `, ${formatTenge(card.total)}` : ''}${card.note ? `, комментарий: «${card.note}»` : ''}]`;
}

/** WhatsApp creates the catalog itself when the first product is added in the app — not through the API. */
export const NO_CATALOG =
  'У номера ещё нет каталога. Откройте WhatsApp Business на телефоне студии → «Инструменты для бизнеса» → «Каталог» и добавьте любой первый товар — потом синхронизация заработает (товар, добавленный вручную, она не трогает).';

export const catalogLink = (phone: string) => `https://wa.me/c/${phone.replace(/\D/g, '')}`;
