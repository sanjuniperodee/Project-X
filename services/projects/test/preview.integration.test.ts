import { Product, type CreatePaymentRequest, type PaymentView, type ProductInput } from '@px/contracts';
import { InMemoryEventBus } from '@px/service-kit/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildProjectsApp } from '../src/app';
import type { LayoutPreviewPagesRequest } from '@px/contracts';
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
const renders: LayoutPreviewPagesRequest[] = [];

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
    layout: {
      previewPages: async (request: LayoutPreviewPagesRequest) => {
        renders.push(request);
        return { pages: [{ number: 1, kind: 'cover', widthMm: 210, heightMm: 297, previewUrl: '/api/media/files/preview_x_p001.svg' }], warnings: [] };
      },
    },
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

it('shows the issue from the current answers between the deposit and the submit', async () => {
  const created = (
    await http('POST', '/projects', {
      productId: 'glossy',
      subject: 'Айгерим',
      selection: { formatId: 'basic', extras: {} },
      customer: { name: 'Динара', phone: '+7 701 234 56 78' },
    })
  ).json();
  const { editKey, id } = created;

  const early = await http('POST', `/projects/${editKey}/preview`);
  expect(early.statusCode).toBe(409);
  expect(early.json().error.message).toBe('Внесите предоплату, чтобы увидеть превью номера');

  await bus.publish('payments.succeeded', { paymentId: 'pay-1', projectId: id, kind: 'deposit', amount: 10_000 });
  await app.relay.flush();
  await bus.drain();
  await http('PUT', `/projects/${editKey}/steps/hero`, { answers: { name: 'Айгерим' } });

  const first = await http('POST', `/projects/${editKey}/preview`);
  expect(first.statusCode).toBe(200);
  expect(first.json().pages).toHaveLength(1);
  expect(renders).toHaveLength(1);
  expect(renders[0]!.draft.sections).toEqual([{ heading: 'Hero', body: 'Name: Айгерим' }]);

  // Unchanged answers: the same preview, no second render.
  await http('POST', `/projects/${editKey}/preview`);
  expect(renders).toHaveLength(1);

  await http('PUT', `/projects/${editKey}/steps/hero`, { answers: { name: 'Айгерим Сапарова' } });
  await http('POST', `/projects/${editKey}/preview`);
  expect(renders).toHaveLength(2);
  expect(renders[1]!.draft.sections[0]!.body).toBe('Name: Айгерим Сапарова');

  await http('POST', `/projects/${editKey}/submit`);
  const late = await http('POST', `/projects/${editKey}/preview`);
  expect(late.statusCode).toBe(409);
});
