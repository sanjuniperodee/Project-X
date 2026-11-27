import { InMemoryEventBus } from '@px/service-kit/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildPaymentsApp } from '../src/app';
import { createDatabase, runMigrations } from '../src/infrastructure/db/client';
import { MockPaymentProvider } from '../src/providers/mock-provider';

const database = createDatabase(process.env.TEST_DATABASE_URL ?? 'postgres://px:px@localhost:5432/px_payments_test');
const bus = new InMemoryEventBus();
let app: Awaited<ReturnType<typeof buildPaymentsApp>>;

beforeAll(async () => {
  await database.db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
  await runMigrations(database.db, './drizzle');
  app = await buildPaymentsApp({
    db: database.db,
    connectBus: async () => bus,
    provider: new MockPaymentProvider('http://localhost:3000'),
    logLevel: 'warn',
  });
});

afterAll(async () => {
  await app?.service.app.close();
  await database.close();
});

it('creates a checkout, settles it once and publishes payments.succeeded', async () => {
  const created = await app.service.app.inject({
    method: 'POST',
    url: '/internal/payments',
    payload: {
      projectId: 'p-1',
      kind: 'deposit',
      amount: 10_000,
      description: 'Предоплата',
      returnUrl: 'http://localhost:3000/glossy/p/key',
    },
  });
  expect(created.statusCode).toBe(201);
  const payment = created.json();
  expect(payment.redirectUrl).toBe(`http://localhost:3000/pay/mock/${payment.id}`);

  const confirm = () =>
    app.service.app.inject({ method: 'POST', url: `/payments/${payment.id}/mock/confirm`, payload: { outcome: 'success' } });
  expect((await confirm()).json().status).toBe('succeeded');
  expect((await confirm()).statusCode).toBe(200); // idempotent

  await app.relay.flush();
  const events = bus.published.filter((e) => e.type === 'payments.succeeded');
  expect(events).toHaveLength(1);
  expect(events[0]!.data).toEqual({ paymentId: payment.id, projectId: 'p-1', kind: 'deposit', amount: 10_000 });

  const cancel = await app.service.app.inject({
    method: 'POST',
    url: `/payments/${payment.id}/mock/confirm`,
    payload: { outcome: 'fail' },
  });
  expect(cancel.statusCode).toBe(409);
});

it('rejects webhooks for unknown providers', async () => {
  const res = await app.service.app.inject({ method: 'POST', url: '/webhooks/kaspi', payload: 'x', headers: { 'content-type': 'text/plain' } });
  expect(res.statusCode).toBe(404);
});
