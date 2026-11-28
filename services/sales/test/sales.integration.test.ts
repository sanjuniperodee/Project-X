import { createHmac } from 'node:crypto';
import { calculateQuote, formatTenge, type AdminProjectView, type Product } from '@px/contracts';
import { createEnvelope } from '@px/service-kit';
import { InMemoryEventBus } from '@px/service-kit/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { setEchoGrace, setPartDelay, toWhatsApp } from '../src/application/sales-service';
import type { WaProduct } from '../src/domain/catalog';
import { nextWorkStart } from '../src/domain/follow-ups';
import type { CatalogGateway, CatalogGatewayWa, ProjectsGateway, SellerAgent, WhatsAppGateway } from '../src/application/ports';
import { toMessages } from '../src/agent/claude-seller';
import { buildSalesApp } from '../src/app';
import { createDatabase, runMigrations } from '../src/infrastructure/db/client';

const database = createDatabase(process.env.TEST_DATABASE_URL ?? 'postgres://px:px@localhost:5432/px_sales_test');
const SECRET = 'gowa-secret';
setEchoGrace(0);
setPartDelay(0);

const product = {
  id: 'glossy',
  name: 'Cover Me',
  domain: 'coverme.kz',
  tagline: 'Журнал',
  deposit: 10_000,
  productionDays: 7,
  formats: [{ id: 'basic', name: 'Basic', description: 'Basic', price: 25_000 }],
  extras: [],
  collaboration: { enabled: true, contributorNoun: 'друзья', inviteTitle: 't', inviteDescription: 't' },
  steps: [{ id: 'hero', title: 'Hero', audience: 'owner', fields: [{ id: 'name', type: 'text', label: 'Name', required: true, maxLength: 200 }] }],
} as unknown as Product;

// ---------- fakes ----------
const sent: { chatId: string; text: string }[] = [];
let sendSeq = 0;
const whatsapp: WhatsAppGateway = {
  enabled: true,
  sendText: async (chatId, text) => {
    sent.push({ chatId, text });
    return `OUT${++sendSeq}`;
  },
  status: async () => ({ reachable: true, loggedIn: true, phone: '77000000000', problem: null }),
  loginQr: async () => ({ image: 'data:image/png;base64,AA', seconds: 30 }),
  logout: async () => {},
  connect: async () => {},
};
const catalog: CatalogGateway = { products: async () => [product], product: async () => product };

const store = new Map<string, AdminProjectView>();
const checkouts: { editKey: string; kind: string }[] = [];
const projects: ProjectsGateway = {
  create: async (req) => {
    const id = `p${store.size + 1}`;
    const view = {
      id,
      editKey: `edit-${id}`,
      productId: req.productId,
      subject: req.subject,
      status: 'draft',
      quote: calculateQuote(product, req.selection as never),
      customer: req.customer,
      answers: {},
      contributions: [],
      draft: null,
      layout: null,
      design: { mode: 'auto', revisionsUsed: 0, revisionsLimit: 3 },
      layouts: [],
      inviteKey: `inv-${id}`,
      paidAmount: 0,
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as AdminProjectView;
    store.set(view.editKey, view);
    return { id, editKey: view.editKey, inviteKey: view.inviteKey };
  },
  get: async (editKey) => store.get(editKey)!,
  checkout: async (editKey, kind) => {
    checkouts.push({ editKey, kind });
    return { paymentId: 'pay', redirectUrl: 'https://px.test/pay/kaspi/pay' };
  },
  byId: async (id) => [...store.values()].find((p) => p.id === id)!,
};

/** Scripted seller: on "хочу журнал" it orders and bills through the real tools; on "человек" it hands off. */
const seen: string[][] = [];
let duringReply: (() => Promise<void>) | null = null;
const agent: SellerAgent = {
  reply: async ({ history, tools, mode, check }) => {
    seen.push(toMessages(history).map((m) => `${m.role}:${String(m.content)}`));
    if (duringReply) {
      const fn = duringReply;
      duringReply = null;
      await fn();
    }
    if (mode === 'follow_up') return { text: 'Получилось посмотреть формат? 😊', handedOff: false };
    const last = history.at(-1)!.text;
    if (/человек/.test(last)) {
      await tools.handOff('human_request', 'Клиент просит человека, хочет журнал подруге');
      return { text: 'Передал менеджеру.', handedOff: true };
    }
    if (/журнал/.test(last)) {
      const order = await tools.createOrder({ productId: 'glossy', formatId: 'basic', extras: {}, subject: 'Айгерим', customerName: 'Динара' });
      const again = await tools.createOrder({ productId: 'glossy', formatId: 'basic', extras: {}, subject: 'Айгерим', customerName: 'Динара' });
      const invoice = await tools.sendInvoice(order.project.id, 'deposit');
      const repeat = await tools.sendInvoice(order.project.id, 'deposit');
      return { text: `Счёт на ${invoice.amount} в Kaspi (${again.reused}, ${repeat.alreadySent}). Кабинет: ${order.workspaceUrl} и вот https://evil.example/x`, handedOff: false };
    }
    if (/карточк/.test(last)) {
      return { text: await tools.sendProductCard('glossy', 'basic', 'Вот этот формат'), handedOff: false };
    }
    if (/сумм/.test(last)) {
      const ok = check('Журнал стоит 25 000 ₸, предоплата 10 000 ₸.', []).length;
      const bad = check('Сегодня скидка 10%: всего 19 990 ₸, карта 4111 1111 1111 1111', []);
      return { text: `ok=${ok} bad=${bad.length}`, handedOff: false };
    }
    if (/спасибо/i.test(last)) return { text: null, handedOff: false };
    return { text: 'Здравствуйте! Для кого подарок?\n\nИ к какой дате?', handedOff: false };
  },
};

// ---------- WhatsApp catalog fake ----------
const waStore: WaProduct[] = [];
const cardsSent: { chatId: string; productId: string; body: string }[] = [];
const waCatalog: CatalogGatewayWa = {
  products: async () => [...waStore],
  create: async (w, images) => {
    const p: WaProduct = { id: String(9000 + waStore.length), name: w.name, description: w.description, price: w.price, currency: 'KZT', retailerId: w.retailerId, url: w.url, hidden: false, imageUrls: images, review: 'APPROVED' };
    waStore.push(p);
    return p;
  },
  edit: async (id, w, images) => {
    const i = waStore.findIndex((p) => p.id === id);
    waStore[i] = { ...waStore[i]!, name: w.name, description: w.description, price: w.price, url: w.url, imageUrls: images, review: 'PENDING' };
    return waStore[i]!;
  },
  remove: async (ids) => {
    for (const id of ids) waStore.splice(waStore.findIndex((p) => p.id === id), 1);
  },
  commerceExperience: async () => 'catalog',
  uploadImages: async (images) => images.map((i) => `https://mmg.whatsapp.net/${i.name}`),
  sendProduct: async (chatId, card) => {
    cardsSent.push({ chatId, productId: card.productId, body: card.body });
    return `CARD${cardsSent.length}`;
  },
  sendCatalogLink: async () => 'LINK1',
};

let app: Awaited<ReturnType<typeof buildSalesApp>>;
const bus = new InMemoryEventBus();

beforeAll(async () => {
  await database.db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
  await runMigrations(database.db, './drizzle');
  app = await buildSalesApp({
    db: database.db,
    connectBus: async () => bus,
    whatsapp,
    waCatalog,
    media: { read: async (url) => ({ data: new Uint8Array([1, 2, 3]), name: url.split('/').pop()!, mime: 'image/jpeg' }) },
    catalog,
    projects,
    agent: () => agent,
    frontendUrl: 'https://px.test',
    productUrls: { glossy: 'https://coverme.test' },
    studioPhone: '77770000001',
    webhookSecret: SECRET,
    logLevel: 'warn',
  });
});

afterAll(async () => {
  await app?.service.app.close();
  await database.close();
});

beforeEach(() => {
  sent.length = 0;
});

let seq = 0;
const webhook = (payload: object, secret = SECRET) => {
  const body = JSON.stringify({ event: 'message', device_id: 'px', payload });
  return app.service.app.inject({
    method: 'POST',
    url: '/webhooks/whatsapp',
    payload: body,
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` },
  });
};
const customer = (text: string, chat = '77015556677') =>
  webhook({ id: `IN${++seq}`, chat_id: `${chat}@s.whatsapp.net`, from_name: 'Динара', body: text, timestamp: new Date().toISOString() });

const conversationId = async (chat = '77015556677') =>
  ((await database.db.execute(sql`select id from conversations where chat_id = ${chat}`))[0] as { id: string }).id;

it('rejects unsigned webhooks and ignores groups', async () => {
  expect((await webhook({ id: 'X', chat_id: '1@s.whatsapp.net', body: 'hi' }, 'wrong')).statusCode).toBe(401);
  expect((await webhook({ id: 'G1', chat_id: '123@g.us', body: 'hi' })).statusCode).toBe(200);
  expect((await database.db.execute(sql`select count(*)::int as n from conversations`))[0]).toEqual({ n: 0 });
});

it('answers several quick messages once, dedupes redelivery', async () => {
  await customer('Здравствуйте');
  await customer('Есть подарки?');
  await webhook({ id: `IN${seq}`, chat_id: '77015556677@s.whatsapp.net', body: 'Есть подарки?' }); // redelivery
  await app.sales.answer(await conversationId());
  // Two paragraphs go as two messages.
  expect(sent).toEqual([
    { chatId: '77015556677', text: 'Здравствуйте! Для кого подарок?' },
    { chatId: '77015556677', text: 'И к какой дате?' },
  ]);
  expect(seen.at(-1)).toEqual(['user:Здравствуйте\nЕсть подарки?']);
});

it('orders, bills the deposit through Kaspi and only sends our own links', async () => {
  await customer('Хочу журнал для подруги');
  await app.sales.answer(await conversationId());
  expect(checkouts).toEqual([{ editKey: 'edit-p1', kind: 'deposit' }]);
  expect(store.get('edit-p1')!.customer.phone).toBe('+77015556677');
  // The second create/invoice call reused the order and did not push a second Kaspi invoice.
  expect(store.size).toBe(1);
  expect(sent.at(-1)!.text).toBe('Счёт на 10000 в Kaspi (true, true). Кабинет: https://coverme.test/p/edit-p1 и вот [ссылка удалена]');
});

it('notifies the customer about a paid deposit with workspace and invite links, and alerts the studio', async () => {
  store.get('edit-p1')!.paidAmount = 10_000;
  const event = createEnvelope('projects.status_changed', { projectId: 'p1', productId: 'glossy', from: 'draft', to: 'deposit_paid' });
  await bus.publishEnvelope(event);
  await bus.publishEnvelope(event); // redelivery
  await bus.drain();
  const toCustomer = sent.filter((m) => m.chatId === '77015556677');
  expect(toCustomer).toHaveLength(1);
  expect(toCustomer[0]!.text).toContain('https://coverme.test/p/edit-p1');
  expect(toCustomer[0]!.text).toContain('https://coverme.test/invite/inv-p1');
  expect(sent.some((m) => m.chatId === '77770000001' && /Предоплата/.test(m.text))).toBe(true);
});

it('ignores replayed old events', async () => {
  const old = { ...createEnvelope('projects.status_changed', { projectId: 'p1', productId: 'glossy', from: 'deposit_paid', to: 'in_design' }), occurredAt: '2020-01-01T00:00:00.000Z' };
  await bus.publishEnvelope(old);
  await bus.drain();
  expect(sent).toHaveLength(0);
});

it('steps back when the studio answers from its phone, but not for its own echoes', async () => {
  const id = await conversationId();
  await webhook({ id: 'OUT1', chat_id: '77015556677@s.whatsapp.net', body: 'echo', is_from_me: true }); // our earlier send
  let row = (await database.db.execute(sql`select mode from conversations where id = ${id}`))[0] as { mode: string };
  expect(row.mode).toBe('bot');

  await webhook({ id: 'PHONE1', chat_id: '77015556677@s.whatsapp.net', body: 'Здравствуйте, это Айжан из студии', is_from_me: true });
  row = (await database.db.execute(sql`select mode from conversations where id = ${id}`))[0] as { mode: string };
  expect(row.mode).toBe('human');

  await customer('Спасибо!');
  await app.sales.answer(id);
  expect(sent).toHaveLength(0);
});

it('hands a chat to the studio and alerts the owner', async () => {
  await customer('Позовите человека', '77019998877');
  await app.sales.answer(await conversationId('77019998877'));
  expect(sent.map((m) => m.chatId)).toEqual(['77770000001', '77019998877']);
  const view = (await app.service.app.inject({ method: 'GET', url: `/admin/conversations/${await conversationId('77019998877')}` })).json();
  expect(view).toMatchObject({ mode: 'human', handoffReason: 'Клиент просит человека. Клиент просит человека, хочет журнал подруге' });

  await customer('Алло?', '77019998877');
  await app.sales.answer(await conversationId('77019998877'));
  expect(sent).toHaveLength(2); // still with the studio

  const back = await app.service.app.inject({ method: 'POST', url: `/admin/conversations/${view.id}/mode`, payload: { mode: 'bot' } });
  expect(back.json().mode).toBe('bot');
});

it('lists conversations for the studio', async () => {
  const list = (await app.service.app.inject({ method: 'GET', url: '/admin/conversations' })).json();
  expect(list.items.length).toBe(2);
  expect(list.items.find((c: { phone: string }) => c.phone === '77015556677')).toMatchObject({ projectsCount: 1 });
});

it('converts markdown habits to WhatsApp formatting', () => {
  expect(toWhatsApp('## Итог\n**25 000 ₸** за журнал')).toBe('Итог\n*25 000 ₸* за журнал');
});

const chatOf = async (chat: string) => app.sales.answer(await conversationId(chat));

it('stays silent on "спасибо", but hands off when a question gets no answer', async () => {
  await customer('Спасибо!', '77011110001');
  await chatOf('77011110001');
  expect(sent).toHaveLength(0);

  await customer('Спасибо, а сколько стоит?', '77011110002');
  await chatOf('77011110002');
  expect(sent.map((m) => m.chatId)).toEqual(['77770000001']); // studio alert only
});

it('checks money and details in a finished reply against the catalog', async () => {
  await customer('Какие суммы?', '77011110003');
  await chatOf('77011110003');
  expect(sent.at(-1)!.text).toBe('ok=0 bad=3');
});

it('drops a reply the customer overtook, and one the studio overtook', async () => {
  duringReply = () => customer('И ещё вопрос: можно на казахском?', '77011110004').then(() => undefined);
  await customer('Здравствуйте', '77011110004');
  await chatOf('77011110004');
  expect(sent).toHaveLength(0);
  const row = (await database.db.execute(sql`select pending from conversations where chat_id = '77011110004'`))[0] as { pending: boolean };
  expect(row.pending).toBe(true);

  duringReply = () => webhook({ id: 'PHONE9', chat_id: '77011110005@s.whatsapp.net', body: 'Сейчас отвечу сама', is_from_me: true }).then(() => undefined);
  await customer('Добрый день', '77011110005');
  await chatOf('77011110005');
  expect(sent).toHaveLength(0);
});

it('syncs our formats into the WhatsApp catalog and sends product cards', async () => {
  const missing = (await app.service.app.inject({ method: 'POST', url: '/admin/catalog/sync' })).json();
  expect(missing.created).toBe(0);
  expect(missing.skipped[0]).toMatch(/нет фото/);

  const photos = await app.service.app.inject({ method: 'PUT', url: '/admin/catalog/photos/glossy', payload: { images: ['/api/media/files/abc123.jpg'] } });
  expect(photos.json().products.find((p: { productId: string }) => p.productId === 'glossy')).toMatchObject({ pending: true });
  const synced = (await app.service.app.inject({ method: 'POST', url: '/admin/catalog/sync' })).json();
  expect(synced).toMatchObject({ created: 1, updated: 0, removed: 0 });
  expect(waStore[0]).toMatchObject({ retailerId: 'px:glossy:basic', price: 25_000, imageUrls: ['https://mmg.whatsapp.net/abc123.jpg'] });
  expect(synced.status.items[0]).toMatchObject({ review: 'approved', outdated: false });

  // Nothing changed: no edits (every edit sends the product back to WhatsApp review).
  expect((await app.service.app.inject({ method: 'POST', url: '/admin/catalog/sync' })).json()).toMatchObject({ created: 0, updated: 0, unchanged: 1 });

  await customer('Покажите карточку', '77011110006');
  await chatOf('77011110006');
  expect(cardsSent).toEqual([{ chatId: '77011110006', productId: '9000', body: 'Вот этот формат' }]);
  const view = (await app.service.app.inject({ method: 'GET', url: `/admin/conversations/${await conversationId('77011110006')}` })).json();
  expect(view.messages.map((m: { text: string }) => m.text)).toContain(`[карточка товара: Cover Me — Basic — ${formatTenge(25_000)}] Вот этот формат`);
});

it('reads a cart from the catalog as a message the bot understands', async () => {
  await webhook({
    id: `IN${++seq}`,
    chat_id: '77011110007@s.whatsapp.net',
    order: { orderID: '123', itemCount: 1, totalAmount1000: 25_000_000, message: 'Хочу к пятнице' },
    timestamp: new Date().toISOString(),
  });
  const view = (await app.service.app.inject({ method: 'GET', url: `/admin/conversations/${await conversationId('77011110007')}` })).json();
  expect(view.messages[0].text).toBe(`[клиент прислал корзину из каталога WhatsApp: 1 шт., ${formatTenge(25_000)}, комментарий: «Хочу к пятнице»]`);
});

it('reminds a silent customer once per step, in working hours', async () => {
  await customer('Привет', '77011110008');
  await chatOf('77011110008');
  expect(sent).toHaveLength(2);
  const later = nextWorkStart(new Date(Date.now() + 4 * 3600_000));
  const at = new Date(Math.max(later.getTime(), Date.now() + 4 * 3600_000) + 60_000);
  await app.sales.followUps(at);
  const mine = sent.filter((m) => m.chatId === '77011110008');
  expect(mine.at(-1)).toEqual({ chatId: '77011110008', text: 'Получилось посмотреть формат? 😊' });
  expect(mine).toHaveLength(3);
  const row = (await database.db.execute(sql`select follow_ups from conversations where chat_id = '77011110008'`))[0] as { follow_ups: number };
  expect(row.follow_ups).toBe(1);
  // A chat the studio took is never reminded.
  expect(sent.some((m) => m.chatId === '77019998877' && /Получилось/.test(m.text))).toBe(false);
});

it('sums the AI spend from the ai service events, once per event', async () => {
  const event = createEnvelope('ai.llm_used', {
    service: 'ai', purpose: 'draft', model: 'claude-opus-5-5',
    inputTokens: 10_000, outputTokens: 2_000, cacheReadTokens: 50_000, cacheWriteTokens: 0, projectId: 'p1',
  });
  await bus.publishEnvelope(event);
  await bus.publishEnvelope(event); // redelivery
  await bus.drain();
  const summary = (await app.service.app.inject({ method: 'GET', url: '/admin/usage?days=7' })).json();
  // 10k × $4 + 2k × $20 + 50k × $0.20 per million = $0.09
  expect(summary.total).toMatchObject({ calls: 1, inputTokens: 10_000, outputTokens: 2_000, cacheReadTokens: 50_000, costUsd: 0.09 });
  expect(summary.byPurpose[0]).toMatchObject({ key: 'ai/draft', costUsd: 0.09 });
  expect(summary.byModel[0]).toMatchObject({ key: 'claude-opus-5-5' });
});
