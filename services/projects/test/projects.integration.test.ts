import { Product, type CreatePaymentRequest, type PaymentView, type ProductInput } from '@px/contracts';
import { createEnvelope } from '@px/service-kit';
import { InMemoryEventBus } from '@px/service-kit/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildProjectsApp } from '../src/app';
import { createDatabase, runMigrations } from '../src/infrastructure/db/client';

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://px:px@localhost:5432/px_projects_test';

const product = Product.parse({
  id: 'glossy',
  name: 'Test Mag',
  domain: 'test.kz',
  tagline: 'Test',
  deposit: 10_000,
  productionDays: 7,
  formats: [{ id: 'basic', name: 'Basic', description: 'Basic', price: 25_000 }],
  extras: [{ id: 'copy', name: 'Copy', description: 'Copy', unitPrice: 5_000, maxQuantity: 3 }],
  collaboration: { enabled: true, contributorNoun: 'друзья', inviteTitle: 't', inviteDescription: 't' },
  steps: [
    {
      id: 'hero',
      title: 'Hero',
      audience: 'owner',
      fields: [
        { id: 'name', type: 'text', label: 'Name', required: true },
        { id: 'party', type: 'date', label: 'Party', role: 'eventDate' },
      ],
    },
    {
      id: 'insight',
      title: 'Insight',
      audience: 'contributor',
      fields: [{ id: 'story', type: 'textarea', label: 'Story', required: true }],
    },
  ],
} satisfies ProductInput);

const payments: CreatePaymentRequest[] = [];
const bus = new InMemoryEventBus();
const database = createDatabase(DATABASE_URL);
let app: Awaited<ReturnType<typeof buildProjectsApp>>;

beforeAll(async () => {
  await database.db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
  await runMigrations(database.db, './drizzle');
  app = await buildProjectsApp({
    db: database.db,
    connectBus: async () => bus,
    catalog: { product: async () => product },
    payments: {
      createPayment: async (request): Promise<PaymentView> => {
        payments.push(request);
        return {
          id: `pay-${payments.length}`,
          projectId: request.projectId,
          kind: request.kind,
          amount: request.amount,
          description: request.description,
          status: 'pending',
          provider: 'test',
          redirectUrl: `https://pay.test/${payments.length}`,
          returnUrl: request.returnUrl,
          createdAt: new Date().toISOString(),
          paidAt: null,
        };
      },
    },
    frontendUrl: 'http://localhost:3000',
    logLevel: 'warn',
  });
});

afterAll(async () => {
  await app?.relay.stop();
  await app?.service.app.close();
  await database.close();
});

const http = (method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown) =>
  app.service.app.inject({ method, url, payload: body as object | undefined });

async function settle() {
  await app.relay.flush();
  await bus.drain();
}

describe('project lifecycle', () => {
  let editKey = '';
  let inviteKey = '';
  let projectId = '';

  it('creates a project with a price snapshot', async () => {
    const res = await http('POST', '/projects', {
      productId: 'glossy',
      subject: 'Айгерим',
      selection: { formatId: 'basic', extras: { copy: 2 } },
      customer: { name: 'Динара', phone: '+7 701 234 56 78' },
    });
    expect(res.statusCode).toBe(201);
    ({ editKey, inviteKey, id: projectId } = res.json());

    const view = (await http('GET', `/projects/${editKey}`)).json();
    expect(view.status).toBe('draft');
    expect(view.quote.total).toBe(35_000);
    expect(view.customer.phone).toBe('+77012345678');
  });

  it('rejects invalid input with field errors', async () => {
    const res = await http('POST', '/projects', { productId: 'glossy', subject: '', selection: { formatId: 'basic' }, customer: { name: 'A', phone: '1' } });
    expect(res.statusCode).toBe(422);
    expect(Object.keys(res.json().error.fields)).toEqual(expect.arrayContaining(['subject', 'customer.name', 'customer.phone']));
  });

  it('collects contributions from invited people', async () => {
    const invite = (await http('GET', `/invites/${inviteKey}`)).json();
    expect(invite).toMatchObject({ subject: 'Айгерим', ownerName: 'Динара', acceptingContributions: true });

    const bad = await http('POST', `/invites/${inviteKey}/contributions`, { authorName: 'Ерлан', answers: {} });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.fields['insight.story']).toBeDefined();

    const ok = await http('POST', `/invites/${inviteKey}/contributions`, {
      authorName: 'Ерлан',
      answers: { insight: { story: 'Как мы потерялись в Чарыне' } },
    });
    expect(ok.statusCode).toBe(201);
  });

  it('requires the deposit before sending to the designer', async () => {
    await http('PUT', `/projects/${editKey}/steps/hero`, { answers: { name: 'Айгерим', party: '2026-12-12' } });
    const res = await http('POST', `/projects/${editKey}/submit`);
    expect(res.statusCode).toBe(409);
    // The gift date from the questionnaire becomes the production deadline.
    expect((await http('GET', `/admin/projects/${projectId}`)).json().deadline).toBe('2026-12-12');
  });

  it('charges the deposit computed on the server and applies the payment event once', async () => {
    const checkout = await http('POST', `/projects/${editKey}/checkout`, { kind: 'deposit' });
    expect(checkout.statusCode).toBe(200);
    expect(payments.at(-1)).toMatchObject({ kind: 'deposit', amount: 10_000, projectId });
    expect(payments.at(-1)!.returnUrl).toBe(`http://localhost:3000/glossy/p/${editKey}?payment=deposit`);

    const event = { paymentId: 'pay-1', projectId, kind: 'deposit' as const, amount: 10_000 };
    const envelope = createEnvelope('payments.succeeded', event);
    await bus.publishEnvelope(envelope);
    await bus.publishEnvelope(envelope); // redelivery
    await settle();

    const view = (await http('GET', `/projects/${editKey}`)).json();
    expect(view.status).toBe('deposit_paid');
    expect(view.paidAmount).toBe(10_000);

    const again = await http('POST', `/projects/${editKey}/checkout`, { kind: 'deposit' });
    expect(again.statusCode).toBe(409);
  });

  it('submits, publishes the event with contributions and receives the AI draft', async () => {
    const res = await http('POST', `/projects/${editKey}/submit`);
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('in_design');
    await settle();

    const submitted = bus.published.find((e) => e.type === 'projects.submitted');
    expect(submitted?.data).toMatchObject({ projectId, answers: { hero: { name: 'Айгерим' } } });
    expect((submitted?.data as { contributions: unknown[] }).contributions).toHaveLength(1);

    const locked = await http('PUT', `/projects/${editKey}/steps/hero`, { answers: { name: 'X' } });
    expect(locked.statusCode).toBe(409);

    await bus.publish('ai.draft_generated', {
      projectId,
      generator: 'test',
      draft: { title: 'Айгерим', lead: 'Lead', sections: [], cards: [] },
    });
    await settle();
    expect((await http('GET', `/projects/${editKey}`)).json().draft.title).toBe('Айгерим');
  });

  it('lets the studio move it forward and the balance payment completes it', async () => {
    const forbidden = await http('POST', `/admin/projects/${projectId}/status`, { to: 'paid' });
    expect(forbidden.statusCode).toBe(409);

    const approved = await http('POST', `/admin/projects/${projectId}/status`, { to: 'awaiting_approval', note: 'Макет v1' });
    expect(approved.json().status).toBe('awaiting_approval');

    await http('POST', `/projects/${editKey}/checkout`, { kind: 'balance' });
    expect(payments.at(-1)).toMatchObject({ kind: 'balance', amount: 25_000 });

    await bus.publish('payments.succeeded', { paymentId: 'pay-x', projectId, kind: 'balance', amount: 25_000 });
    await settle();

    const view = (await http('GET', `/projects/${editKey}`)).json();
    expect(view.status).toBe('paid');
    expect(view.history.map((h: { to: string }) => h.to)).toEqual([
      'draft',
      'deposit_paid',
      'in_design',
      'awaiting_approval',
      'paid',
    ]);

    const list = (await http('GET', '/admin/projects?status=paid')).json();
    expect(list.items).toHaveLength(1);
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ contributionsCount: 1, paidAmount: 35_000, deadline: '2026-12-12' });
  });
});

describe('studio back office', () => {
  const create = async (subject: string, name: string, phone: string) => {
    const res = await http('POST', '/projects', {
      productId: 'glossy',
      subject,
      selection: { formatId: 'basic' },
      customer: { name, phone },
    });
    return res.json() as { id: string; editKey: string };
  };

  it('filters, searches, sorts and pages the order list', async () => {
    const a = await create('Ерлан', 'Мадина', '+7 777 000 11 22');
    await create('Жанна', 'Мадина', '+7 777 000 11 22');
    await http('PUT', `/projects/${a.editKey}/steps/hero`, { answers: { name: 'Ерлан', party: '2026-12-01' } });

    const byPhone = (await http('GET', '/admin/projects?q=0001122')).json();
    expect(byPhone.total).toBe(2);
    const exact = (await http('GET', '/admin/projects?phone=%2B77770001122')).json();
    expect(exact.total).toBe(2);
    const byHero = (await http('GET', '/admin/projects?q=жан')).json();
    expect(byHero.items.map((i: { subject: string }) => i.subject)).toEqual(['Жанна']);

    const drafts = (await http('GET', '/admin/projects?status=draft,deposit_paid&sort=deadline')).json();
    expect(drafts.items[0].subject).toBe('Ерлан'); // the nearest deadline first, no deadline last
    expect(drafts.items.at(-1).deadline).toBeNull();

    const page = (await http('GET', '/admin/projects?limit=1&offset=1')).json();
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(3);

    const bad = await http('GET', '/admin/projects?status=nope');
    expect(bad.statusCode).toBe(422);
  });

  it('counts the dashboard numbers', async () => {
    const stats = (await http('GET', '/admin/stats')).json();
    expect(stats.byStatus).toMatchObject({ paid: 1, draft: 2 });
    expect(stats.byProduct).toEqual([{ productId: 'glossy', orders: 3, paidOrders: 1, revenue: 35_000 }]);
    expect(stats.attention.toPrint).toBe(1);
    expect(stats.attention.deadlineSoon).toBeGreaterThanOrEqual(0);
    expect(stats.month.orders).toBe(3);
    expect(stats.averageCheck).toBe(35_000);
    expect(stats.funnel).toEqual({ created: 3, deposit: 1, paid: 1 });
  });

  it('groups customers by phone', async () => {
    const customers = (await http('GET', '/admin/customers')).json();
    expect(customers.total).toBe(2);
    const madina = customers.items.find((c: { name: string }) => c.name === 'Мадина');
    expect(madina).toMatchObject({ phone: '+77770001122', orders: 2, activeOrders: 2, revenue: 0, productIds: ['glossy'] });
    expect((await http('GET', '/admin/customers?q=динар')).json().items[0].name).toBe('Динара');
  });

  it('keeps internal notes on a project', async () => {
    const [first] = (await http('GET', '/admin/projects?sort=created')).json().items;
    const empty = await http('POST', `/admin/projects/${first.id}/notes`, { text: ' ' });
    expect(empty.statusCode).toBe(422);
    await http('POST', `/admin/projects/${first.id}/notes`, { text: 'Позвонила, оплатит завтра', author: 'Аня' });
    const view = (await http('POST', `/admin/projects/${first.id}/notes`, { text: 'Оплатила' })).json();
    expect(view.notes.map((n: { text: string }) => n.text)).toEqual(['Оплатила', 'Позвонила, оплатит завтра']);
    expect(view.notes[1].author).toBe('Аня');
  });
});
