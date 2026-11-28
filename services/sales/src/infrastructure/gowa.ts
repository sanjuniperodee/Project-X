import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '@px/service-kit';
import type { InboundMessage, WhatsAppGateway, WhatsAppGatewayStatus } from '../application/ports';
import { cardFromGowaPayload, cardText, toWaPrice } from '../domain/catalog';
import { jidFromChatId } from '../domain/conversation';

/** Device id of the studio number inside the GOWA gateway (one gateway per project on the server). */
const DEVICE = 'px';
const EVENTS = 'message';
/** Personal chats only: no groups, broadcasts, statuses or channels. */
const PERSONAL = /@(s\.whatsapp\.net|lid)$/;

export interface GowaOptions {
  baseUrl: string;
  /** "user:password" from APP_BASIC_AUTH of the gateway. */
  basicAuth: string;
  webhookUrl: string;
  webhookSecret: string;
  fetchImpl?: typeof fetch;
}

/** HTTP client of GOWA (go-whatsapp-web-multidevice v9): studio device, webhook, text messages, QR login. */
export class GowaWhatsApp implements WhatsAppGateway {
  readonly enabled = true;
  private readonly fetch: typeof fetch;

  constructor(private readonly options: GowaOptions) {
    this.fetch = options.fetchImpl ?? ((...args) => fetch(...args));
  }

  async connect() {
    const hook = { webhook_url: this.options.webhookUrl, webhook_secret: this.options.webhookSecret, webhook_events: EVENTS };
    const list = await this.json<{ results?: { id?: string }[] | null }>('GET', '/devices');
    if ((list.results ?? []).some((d) => d.id === DEVICE)) await this.json('PATCH', `/devices/${DEVICE}/webhook`, hook);
    else await this.json('POST', '/devices', { device_id: DEVICE, ...hook });
  }

  async sendText(chatId: string, text: string) {
    const res = await this.json<{ results?: { message_id?: string } }>('POST', '/send/message', { phone: jidFromChatId(chatId), message: text });
    return res.results?.message_id ?? null;
  }

  async status(): Promise<WhatsAppGatewayStatus> {
    try {
      const res = await this.json<{ results?: { is_logged_in?: boolean; jid?: string } }>('GET', '/app/status');
      const jid = res.results?.jid ?? '';
      return { reachable: true, loggedIn: !!res.results?.is_logged_in, phone: jid ? jid.split('@')[0]!.split(':')[0]! : null, problem: null };
    } catch (error) {
      const message = (error as Error).message;
      if (/недоступен/.test(message)) return { reachable: false, loggedIn: false, phone: null, problem: message };
      // A device that was never registered is simply "not linked yet".
      return { reachable: true, loggedIn: false, phone: null, problem: /DEVICE_NOT_FOUND|DEVICE_ID_REQUIRED/.test(message) ? null : message };
    }
  }

  async loginQr() {
    const res = await this.json<{ results?: { qr_link?: string; qr_duration?: number } }>('GET', '/app/login');
    const link = res.results?.qr_link;
    if (!link) throw AppError.conflict('WhatsApp не выдал QR — возможно, номер уже привязан');
    // The link points at the gateway itself (internal address): fetch the image here and hand it over as data.
    const png = await this.raw(new URL(link, this.options.baseUrl).pathname);
    return { image: `data:image/png;base64,${Buffer.from(await png.arrayBuffer()).toString('base64')}`, seconds: res.results?.qr_duration ?? 30 };
  }

  async logout() {
    await this.json('POST', `/devices/${DEVICE}/logout`);
  }

  /** Business profile of the linked number: commerce_experience=catalog once the catalog exists in the app. */
  async commerceExperience(phone: string): Promise<string | null> {
    const res = await this.json<{ results?: { profile_options?: { commerce_experience?: string } } }>('GET', `/user/business-profile?phone=${encodeURIComponent(jidFromChatId(phone))}`);
    return res.results?.profile_options?.commerce_experience ?? null;
  }

  // ---------- WhatsApp Business catalog (GOWA build with the catalog patch, same as MyBooks / DoseWear) ----------

  /** GraphQL operation of the catalog on graph.facebook.com with the number's token (kept inside the gateway). */
  async catalogGraphql(docId: string, variables: unknown): Promise<unknown> {
    const res = await this.json<{ results?: { http_status?: number; body?: unknown } }>('POST', '/catalog/graphql', { doc_id: docId, variables, locale: 'ru_RU' }, 180_000);
    if (res.results?.body === undefined) throw new AppError('unavailable', `WhatsApp: ответ каталога не разобрать (HTTP ${res.results?.http_status ?? '?'})`);
    return res.results.body;
  }

  /** Who edits: business person id (actor_id) and the number's LID (mutations address the business by LID). */
  async catalogToken(fresh = false) {
    const res = await this.json<{ results?: { business_person_id?: string; jid?: string; lid?: string } }>('GET', `/catalog/token${fresh ? '?fresh=1' : ''}`, undefined, 120_000);
    return { businessPersonId: res.results?.business_person_id ?? '', jid: res.results?.jid ?? '', lid: res.results?.lid ?? '' };
  }

  async uploadProductImages(images: { data: Uint8Array; name: string; mime: string }[]): Promise<string[]> {
    if (!images.length) return [];
    const form = new FormData();
    for (const img of images) form.append('image', new Blob([Buffer.from(img.data)], { type: img.mime || 'image/jpeg' }), img.name || 'photo.jpg');
    const res = await this.json<{ results?: { urls?: string[] } }>('POST', '/catalog/upload-image', form, 180_000);
    const urls = res.results?.urls ?? [];
    if (urls.length !== images.length) throw new AppError('unavailable', 'WhatsApp не принял фото товара');
    return urls;
  }

  /** Product card in the chat: photo, price, "Message business", add to cart. */
  async sendProduct(chatId: string, card: { productId: string; title: string; description: string; price: number; retailerId: string; url: string; imageUrl: string | null; imageCount: number; body: string }) {
    if (!/^\d{1,40}$/.test(card.productId)) throw AppError.badRequest('Неверный id товара');
    const product = {
      product_id: card.productId,
      title: card.title,
      description: card.description,
      currency: 'KZT',
      price_amount_1000: toWaPrice(card.price),
      retailer_id: card.retailerId,
      url: card.url,
      image_url: card.imageUrl ?? '',
      image_count: card.imageCount,
      body: card.body,
    };
    const res = await this.json<{ results?: { message_id?: string } }>('POST', '/catalog/send-product', { phone: jidFromChatId(chatId), product }, 120_000);
    return res.results?.message_id ?? null;
  }

  /** wa.me/c/<number> with a catalog preview (cover: first product photo). */
  async sendCatalogLink(chatId: string, text: string, preview: { title: string; description: string; imageUrl: string | null }) {
    const res = await this.json<{ results?: { message_id?: string } }>(
      'POST',
      '/catalog/send-link',
      { phone: jidFromChatId(chatId), text, title: preview.title, description: preview.description, image_url: preview.imageUrl ?? '' },
      60_000,
    );
    return res.results?.message_id ?? null;
  }

  private headers(): Record<string, string> {
    return {
      'X-Device-Id': DEVICE,
      ...(this.options.basicAuth ? { Authorization: `Basic ${Buffer.from(this.options.basicAuth).toString('base64')}` } : {}),
    };
  }

  private async raw(path: string) {
    let res: Response;
    try {
      res = await this.fetch(`${this.options.baseUrl.replace(/\/+$/, '')}${path}`, { headers: this.headers(), signal: AbortSignal.timeout(20_000) });
    } catch {
      throw new AppError('unavailable', 'Шлюз WhatsApp недоступен');
    }
    if (!res.ok) throw new AppError('unavailable', `Шлюз WhatsApp: HTTP ${res.status}`);
    return res;
  }

  private async json<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown, timeoutMs = 15_000): Promise<T> {
    const isForm = body instanceof FormData;
    let res: Response;
    try {
      res = await this.fetch(`${this.options.baseUrl.replace(/\/+$/, '')}${path}`, {
        method,
        headers: { ...this.headers(), ...(body === undefined || isForm ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new AppError('unavailable', 'Шлюз WhatsApp недоступен');
    }
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      data = {};
    }
    if (!res.ok) {
      if (res.status === 401) throw new AppError('unavailable', 'Шлюз WhatsApp не принял логин и пароль');
      throw new AppError('unavailable', `WhatsApp: ${String(data.code ?? '')} ${String(data.message ?? text.slice(0, 200))}`.trim());
    }
    return data as T;
  }
}

/** WhatsApp is not configured: nothing is sent (development, tests without a gateway). */
export class DisabledWhatsApp implements WhatsAppGateway {
  readonly enabled = false;
  async sendText() {
    return null;
  }
  async status() {
    return { reachable: false, loggedIn: false, phone: null, problem: 'WhatsApp не настроен' };
  }
  async loginQr(): Promise<{ image: string; seconds: number }> {
    throw AppError.conflict('WhatsApp не настроен');
  }
  async logout() {}
  async connect() {}
}

/** GOWA webhook signature: `X-Hub-Signature-256: sha256=<hex HMAC-SHA256(body, secret)>`. */
export function verifyGowaSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const got = Buffer.from(signature.trim().replace(/^sha256=/, ''), 'hex');
  return got.length === expected.length && timingSafeEqual(expected, got);
}

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Text messages from a GOWA webhook body. Media without a caption becomes a short placeholder the bot can react to. */
export function parseGowaWebhook(body: unknown): InboundMessage[] {
  const b = rec(body);
  if (str(b.event) !== 'message') return [];
  const p = rec(b.payload);
  const chat = str(p.chat_id);
  const externalId = str(p.id);
  if (!externalId || !PERSONAL.test(chat)) return [];
  const card = cardFromGowaPayload(p);
  let text = card ? cardText(card) : str(p.body).trim();
  if (!text) {
    const media = ['image', 'video', 'audio', 'document', 'sticker', 'location', 'contact'].find((k) => k in p);
    if (!media) return [];
    text = media === 'audio' ? '[голосовое сообщение]' : `[${media}]`;
  }
  const at = new Date(str(p.timestamp));
  return [
    {
      externalId,
      chatId: chat,
      text: text.slice(0, 4000),
      contactName: str(p.from_name),
      fromMe: p.is_from_me === true,
      at: Number.isNaN(at.getTime()) ? new Date() : at,
    },
  ];
}
