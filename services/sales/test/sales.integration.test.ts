import { createHmac } from 'node:crypto';
import { calculateQuote, type Product, type ProjectView } from '@px/contracts';
import { createEnvelope } from '@px/service-kit';
import { InMemoryEventBus } from '@px/service-kit/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { setEchoGrace } from '../src/application/sales-service';
import type { CatalogGateway, ProjectsGateway, SellerAgent, WhatsAppGateway } from '../src/application/ports';
import { toMessages } from '../src/agent/claude-seller';
import { buildSalesApp } from '../src/app';
import { createDatabase, runMigrations } from '../src/infrastructure/db/client';

const database = createDatabase(process.env.TEST_DATABASE_URL ?? 'postgres://px:px@localhost:5432/px_sales_test');
const SECRET = 'gowa-secret';
setEchoGrace(0);

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

const store = new Map<string, ProjectView & { editKey: string }>();
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
      inviteKey: `inv-${id}`,
      paidAmount: 0,
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as ProjectView & { editKey: string };
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
const agent: SellerAgent = {
  reply: async ({ history, tools }) => {
    seen.push(toMessages(history).map((m) => `${m.role}:${String(m.content)}`));
    const last = history.at(-1)!.text;
    if (/человек/.test(last)) {
      await tools.handOff('Клиент просит человека');
      return 'Передал менеджеру.';
    }
    if (/журнал/.test(last)) {
      const order = await tools.createOrder({ productId: 'glossy', formatId: 'basic', extras: {}, subject: 'Айгерим', customerName: 'Динара' });
      const invoice = await tools.sendInvoice(order.project.id, 'deposit');
      return `Счёт на ${invoice.amount} в Kaspi. Кабинет: ${order.workspaceUrl} и вот https://evil.example/x`;
    }
    return 'Здравствуйте! Для кого подарок?';
  },
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
  expect(sent).toEqual([{ chatId: '77015556677', text: 'Здравствуйте! Для кого подарок?' }]);
  expect(seen.at(-1)).toEqual(['user:Здравствуйте\nЕсть подарки?']);
});

it('orders, bills the deposit through Kaspi and only sends our own links', async () => {
  await customer('Хочу журнал для подруги');
  await app.sales.answer(await conversationId());
  expect(checkouts).toEqual([{ editKey: 'edit-p1', kind: 'deposit' }]);
  expect(store.get('edit-p1')!.customer.phone).toBe('+77015556677');
  expect(sent.at(-1)!.text).toBe('Счёт на 10000 в Kaspi. Кабинет: https://coverme.test/p/edit-p1 и вот [ссылка удалена]');
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
  expect(view).toMatchObject({ mode: 'human', handoffReason: 'Клиент просит человека' });

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
