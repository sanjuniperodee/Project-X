import { AppError } from '@px/service-kit';
import { graphData, graphError, parseGraphProduct, productInfo, type WaProduct, type WantedProduct } from '../domain/catalog';
import type { CatalogGatewayWa } from '../application/ports';
import type { GowaWhatsApp } from './gowa';

/**
 * Document ids of the WhatsApp Web catalog operations (WAWebBizCatalogManagement*), the same MyBooks and DoseWear use.
 * WhatsApp changes them rarely; when it does, edits fail while cards keep working — override with WA_CATALOG_DOCS
 * (JSON, e.g. {"add":"…"}) without a release.
 */
const DOCS = {
  owner: '9957894520961099',
  add: '24249359867999500',
  edit: '9889773371084956',
  remove: '9376108569185474',
} as const;
type DocKey = keyof typeof DOCS;
const IMAGE_SIZE = 400;

export class WaCatalog implements CatalogGatewayWa {
  private actor: { lid: string; personId: string } | null = null;
  private readonly docs: Record<DocKey, string>;

  constructor(
    private readonly gowa: GowaWhatsApp,
    overrides: Partial<Record<DocKey, string>> = {},
  ) {
    this.docs = { ...DOCS, ...overrides };
  }

  /** The catalog as the owner sees it (hidden and in-review products too). */
  async products(): Promise<WaProduct[]> {
    const { lid } = await this.who();
    const out: WaProduct[] = [];
    let after: string | null = null;
    for (let page = 0; page < 40; page++) {
      const body = await this.gowa.catalogGraphql(this.docs.owner, {
        request: { product_catalog: { jid: lid, width: String(IMAGE_SIZE), height: String(IMAGE_SIZE), limit: '50', ...(after ? { after } : {}) } },
      });
      this.check(body, 'owner');
      const catalog = (graphData(body, 'xfb_whatsapp_catalog').product_catalog ?? {}) as { products?: unknown[]; paging?: { after?: string | null } };
      for (const raw of catalog.products ?? []) {
        const p = parseGraphProduct(raw);
        if (p) out.push(p);
      }
      const next = catalog.paging?.after || null;
      if (!next || next === after || !(catalog.products ?? []).length) break;
      after = next;
    }
    return out;
  }

  async create(w: WantedProduct, imageUrls: string[]): Promise<WaProduct> {
    const data = await this.mutate('add', 'xfb_whatsapp_catalog_add_product', {
      product: { biz_jid: (await this.who()).lid, width: IMAGE_SIZE, height: IMAGE_SIZE, product_info: productInfo(w, imageUrls) },
    });
    return this.product(data);
  }

  /** WhatsApp replaces the whole product: images not passed again are lost. */
  async edit(id: string, w: WantedProduct, imageUrls: string[]): Promise<WaProduct> {
    if (!/^\d{1,40}$/.test(id)) throw AppError.badRequest('Неверный id товара');
    const data = await this.mutate('edit', 'xfb_whatsapp_catalog_edit_product', {
      product: { biz_jid: (await this.who()).lid, product_id: id, width: IMAGE_SIZE, height: IMAGE_SIZE, product_info: productInfo(w, imageUrls) },
    });
    return this.product(data);
  }

  async remove(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.mutate('remove', 'xfb_whatsapp_catalog_delete_product', { biz_jid: (await this.who()).lid, product_ids: ids });
  }

  uploadImages(images: { data: Uint8Array; name: string; mime: string }[]) {
    return this.gowa.uploadProductImages(images);
  }

  sendProduct(chatId: string, card: Parameters<GowaWhatsApp['sendProduct']>[1]) {
    return this.gowa.sendProduct(chatId, card);
  }

  sendCatalogLink(chatId: string, text: string, preview: { title: string; description: string; imageUrl: string | null }) {
    return this.gowa.sendCatalogLink(chatId, text, preview);
  }

  private async who() {
    if (this.actor) return this.actor;
    const t = await this.gowa.catalogToken();
    if (!/@lid$/.test(t.lid) || !t.businessPersonId) {
      throw AppError.conflict('WhatsApp не дал доступ к каталогу: номер должен быть в приложении WhatsApp Business, шлюз — сборка с каталогом');
    }
    this.actor = { lid: t.lid, personId: t.businessPersonId };
    return this.actor;
  }

  private async mutate(key: DocKey, field: string, input: Record<string, unknown>) {
    const body = await this.gowa.catalogGraphql(this.docs[key], { input: { ...input, actor_id: (await this.who()).personId } });
    this.check(body, key);
    return graphData(body, field);
  }

  private check(body: unknown, key: DocKey) {
    const problem = graphError(body);
    if (!problem) return;
    if (/RecoveryRequired/i.test(problem)) {
      throw AppError.conflict('WhatsApp просит подтвердить почту бизнеса в приложении WhatsApp Business на телефоне студии');
    }
    const stale = /persisted query|document|doc_id|not found|Unknown/i.test(problem) ? ` (возможно, WhatsApp сменил запрос «${key}» — WA_CATALOG_DOCS)` : '';
    throw new AppError('unavailable', `WhatsApp: ${problem}${stale}`);
  }

  private product(data: Record<string, unknown>) {
    const p = parseGraphProduct(data.product);
    if (!p) throw new AppError('unavailable', 'WhatsApp не вернул товар');
    return p;
  }
}
