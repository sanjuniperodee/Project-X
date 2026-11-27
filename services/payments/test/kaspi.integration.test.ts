import { createHmac } from 'node:crypto';
import { InMemoryEventBus } from '@px/service-kit/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildPaymentsApp } from '../src/app';
import { createDatabase, runMigrations } from '../src/infrastructure/db/client';
import { KaspiPaymentProvider } from '../src/providers/kaspi/kaspi-provider';

const database = createDatabase(process.env.TEST_DATABASE_URL ?? 'postgres://px:px@localhost:5432/px_payments_test');
const bus = new InMemoryEventBus();
const SECRET = 'webhook-secret';

/** Fake kaspi-pos: remembers created invoices, answers details with the status set by the test. */
const kaspi = {
  created: [] as { phoneNumber: string; amount: number }[],
  statuses: new Map<string, string>(),
  headers: [] as Record<string, string>[],
};
const fakeFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  kaspi.headers.push(init?.headers as Record<string, string>);
  if (url.pathname === '/api/invoice/create') {
    const body = JSON.parse(String(init?.body));
    kaspi.created.push(body);
    const id = String(1000 + kaspi.created.length);
    kaspi.statuses.set(id, 'Wait');
    return Response.json({ StatusCode: 0, Data: { Id: Number(id), Status: 'Wait' } });
  }
  if (url.pathname === '/api/invoice/details') {
    const id = url.searchParams.get('operationId')!;
    return Response.json({ StatusCode: 0, Data: { Id: Number(id), Status: kaspi.statuses.get(id) ?? 'Unknown' } });
  }
  return new Response('not found', { status: 404 });
};

let app: Awaited<ReturnType<typeof buildPaymentsApp>>;

beforeAll(async () => {
  await database.db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
  await runMigrations(database.db, './drizzle');
  app = await buildPaymentsApp({
    db: database.db,
    connectBus: async () => bus,
    provider: new KaspiPaymentProvider({
      apiUrl: 'http://kaspi-pos.test',
      tokenSn: 'sn',
      vtokenSecret: 'vs',
      profileId: 7,
      webhookSecret: SECRET,
      frontendUrl: 'http://localhost:3000',
      fetchImpl: fakeFetch,
    }),
    logLevel: 'warn',
  });
});

afterAll(async () => {
  await app?.service.app.close();
  await database.close();
});

const create = (customerPhone?: string) =>
  app.service.app.inject({
    method: 'POST',
    url: '/internal/payments',
    payload: {
      projectId: 'p-1',
      kind: 'deposit',
      amount: 10_000,
      description: 'Предоплата: Cover Me — Айгерим',
      returnUrl: 'http://localhost:3000/glossy/p/key?payment=deposit',
      customerPhone,
    },
  });

const webhook = (payload: object, secret = SECRET) => {
  const body = JSON.stringify(payload);
  return app.service.app.inject({
    method: 'POST',
    url: '/webhooks/kaspi',
    payload: body,
    headers: {
      'content-type': 'application/json',
      'x-webhook-signature': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
    },
  });
};

it('bills the customer phone through kaspi-pos with the cashier session', async () => {
  const res = await create('+77012345678');
  expect(res.statusCode).toBe(201);
  const payment = res.json();
  expect(payment.provider).toBe('kaspi');
  expect(payment.redirectUrl).toBe(`http://localhost:3000/pay/kaspi/${payment.id}`);
  expect(kaspi.created.at(-1)).toMatchObject({ phoneNumber: '77012345678', amount: 10_000 });
  expect(kaspi.headers.at(-1)).toMatchObject({ 'X-Token-SN': 'sn', 'X-Vtoken-Secret': 'vs', 'X-Profile-Id': '7' });
});

it('refuses a phone Kaspi cannot bill', async () => {
  const res = await create('+77272345678');
  expect(res.statusCode).toBe(400);
  expect(res.json().error.message).toMatch(/мобильный номер/);
});

it('ignores notifications about payments of other shops and rejects bad signatures', async () => {
  const foreign = await webhook({ event: 'payment.success', paymentId: '999999', type: 'invoice', status: 'Processed' });
  expect(foreign.statusCode).toBe(200);
  expect(foreign.json()).toEqual({ ok: true, ignored: true });

  const forged = await webhook({ event: 'payment.success', paymentId: '1001' }, 'wrong');
  expect(forged.statusCode).toBe(400);
});

it('settles on a webhook only after Kaspi confirms, exactly once', async () => {
  const payment = (await create('87012345678')).json();
  const externalId = String(1000 + kaspi.created.length);

  // The webhook claims success, but Kaspi still says "Wait": nothing changes.
  await webhook({ event: 'payment.success', paymentId: externalId, type: 'invoice', status: 'Processed' });
  expect((await app.service.app.inject({ method: 'GET', url: `/payments/${payment.id}` })).json().status).toBe('pending');

  kaspi.statuses.set(externalId, 'Processed');
  expect((await webhook({ event: 'payment.success', paymentId: externalId })).statusCode).toBe(200);
  expect((await webhook({ event: 'payment.success', paymentId: externalId })).statusCode).toBe(200); // redelivery
  expect((await app.service.app.inject({ method: 'GET', url: `/payments/${payment.id}` })).json().status).toBe('succeeded');

  await app.relay.flush();
  expect(bus.published.filter((e) => e.type === 'payments.succeeded' && (e.data as { paymentId: string }).paymentId === payment.id)).toHaveLength(1);
});

it('reconciles pending payments whose webhook was lost', async () => {
  const payment = (await create('+77012345678')).json();
  const externalId = String(1000 + kaspi.created.length);
  kaspi.statuses.set(externalId, 'RemotePaymentCanceled');

  expect(await app.payments.reconcile()).toBeGreaterThanOrEqual(1);
  expect((await app.service.app.inject({ method: 'GET', url: `/payments/${payment.id}` })).json().status).toBe('cancelled');
});

it('has no manual confirmation outside the test provider', async () => {
  const payment = (await create('+77012345678')).json();
  const res = await app.service.app.inject({ method: 'POST', url: `/payments/${payment.id}/mock/confirm`, payload: { outcome: 'success' } });
  expect(res.statusCode).toBe(404);
});
