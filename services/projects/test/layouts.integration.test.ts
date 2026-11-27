import { Product, type CreatePaymentRequest, type EventEnvelope, type PaymentView, type ProductInput } from '@px/contracts';
import { createEnvelope } from '@px/service-kit';
import { InMemoryEventBus } from '@px/service-kit/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildProjectsApp } from '../src/app';
import { createDatabase, runMigrations } from '../src/infrastructure/db/client';

/**
 * Automatic layout loop: layout.generated → awaiting_approval → approve → balance → paid,
 * and changes → revision_requested (AI + layout again) → after the limit, the studio.
 */
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://px:px@localhost:5432/px_projects_test';

const product = Product.parse({
  id: 'glossy',
  name: 'Test Mag',
  domain: 'test.kz',
  tagline: 'Test',
  deposit: 10_000,
  productionDays: 7,
  formats: [{ id: 'a4-24', name: 'A4', description: 'A4', price: 25_000 }],
  collaboration: { enabled: true, contributorNoun: 'друзья', inviteTitle: 't', inviteDescription: 't' },
  steps: [
    { id: 'hero', title: 'Hero', audience: 'owner', fields: [{ id: 'name', type: 'text', label: 'Name', required: true }] },
    { id: 'insight', title: 'Insight', audience: 'contributor', fields: [{ id: 'story', type: 'textarea', label: 'Story' }] },
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
          redirectUrl: 'https://pay.test',
          returnUrl: request.returnUrl,
          createdAt: new Date().toISOString(),
          paidAt: null,
        };
      },
    },
    frontendUrl: 'http://localhost:3000',
    layoutRevisionLimit: 2,
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

/** Publishes the outbox and lets handlers run, until nothing is left (handlers write to the outbox too). */
async function settle() {
  for (let round = 0; round < 10; round++) {
    await bus.drain();
    if ((await app.relay.flush()) === 0) return;
  }
}

const published = (type: string, projectId: string) =>
  bus.published.filter((e) => e.type === type && (e.data as { projectId: string }).projectId === projectId) as EventEnvelope[];

/** A project the customer has paid the deposit for and submitted, with an AI draft. */
async function projectInDesign() {
  const created = await http('POST', '/projects', {
    productId: 'glossy',
    subject: 'Айгерим',
    selection: { formatId: 'a4-24' },
    customer: { name: 'Динара', phone: '+7 701 234 56 78' },
  });
  const { id, editKey } = created.json() as { id: string; editKey: string };
  await http('PUT', `/projects/${editKey}/steps/hero`, { answers: { name: 'Айгерим' } });
  await bus.publish('payments.succeeded', { paymentId: `dep-${id}`, projectId: id, kind: 'deposit', amount: 10_000 });
  await settle();
  await http('POST', `/projects/${editKey}/submit`);
  await bus.publish('ai.draft_generated', {
    projectId: id,
    generator: 'test',
    draft: { title: 'Айгерим', lead: 'Lead', sections: [{ heading: 'Интервью', body: 'Текст' }], cards: [] },
  });
  await settle();
  return { id, editKey };
}

function layoutGenerated(projectId: string, version: number) {
  return createEnvelope('layout.generated', {
    projectId,
    version,
    pdfUrl: `/api/media/files/layout_x_v${version}.pdf`,
    pages: [{ number: 1, kind: 'cover', widthMm: 210, heightMm: 297, previewUrl: `/api/media/files/layout_x_v${version}_p001.svg` }],
    template: 'glossy-magazine@1',
    warnings: version === 1 ? ['2 фото в формате HEIC не вошло в макет'] : [],
  });
}

const view = async (editKey: string) => (await http('GET', `/projects/${editKey}`)).json();

describe('automatic layout', () => {
  it('gives the layout service a frozen snapshot of the materials', async () => {
    const { id } = await projectInDesign();
    const res = await http('GET', `/internal/projects/${id}/layout-source`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      projectId: id,
      productId: 'glossy',
      formatId: 'a4-24',
      status: 'in_design',
      designMode: 'auto',
      nextVersion: 1,
      answers: { hero: { name: 'Айгерим' } },
    });
    expect((await http('GET', '/internal/projects/00000000-0000-4000-8000-000000000000/layout-source')).statusCode).toBe(404);
  });

  it('shows the generated layout, moves the project to approval once, then the customer approves and pays', async () => {
    const { id, editKey } = await projectInDesign();
    const envelope = layoutGenerated(id, 1);
    await bus.publishEnvelope(envelope);
    await bus.publishEnvelope(envelope); // redelivery
    await bus.publishEnvelope(layoutGenerated(id, 1)); // the same version from a duplicated draft
    await settle();

    let project = await view(editKey);
    expect(project.status).toBe('awaiting_approval');
    expect(project.layout).toMatchObject({ version: 1, status: 'pending', pages: [{ kind: 'cover' }] });
    expect(project.design).toEqual({ mode: 'auto', revisionsUsed: 0, revisionsLimit: 2 });
    const changes = published('projects.status_changed', id).map((e) => (e.data as { to: string }).to);
    expect(changes.filter((to) => to === 'awaiting_approval')).toHaveLength(1);

    // The balance cannot be paid before the layout is approved.
    const early = await http('POST', `/projects/${editKey}/checkout`, { kind: 'balance' });
    expect(early.statusCode).toBe(409);
    expect(early.json().error.message).toMatch(/согласуйте макет/);

    // A decision about another version is refused.
    expect((await http('POST', `/projects/${editKey}/layout/approve`, { version: 2 })).statusCode).toBe(409);

    const approved = await http('POST', `/projects/${editKey}/layout/approve`, { version: 1 });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().layout.status).toBe('approved');
    await settle();
    expect(published('projects.layout_approved', id)).toHaveLength(1);
    expect((await http('POST', `/projects/${editKey}/layout/approve`, { version: 1 })).statusCode).toBe(409);

    const checkout = await http('POST', `/projects/${editKey}/checkout`, { kind: 'balance' });
    expect(checkout.statusCode).toBe(200);
    expect(payments.at(-1)).toMatchObject({ kind: 'balance', amount: 15_000 });
    await bus.publish('payments.succeeded', { paymentId: 'bal', projectId: id, kind: 'balance', amount: 15_000 });
    await settle();
    project = await view(editKey);
    expect(project.status).toBe('paid');

    const admin = (await http('GET', `/admin/projects/${id}`)).json();
    expect(admin.layouts).toHaveLength(1);
    expect(admin.layouts[0]).toMatchObject({ version: 1, status: 'approved', warnings: ['2 фото в формате HEIC не вошло в макет'] });
  });

  it('sends change requests back to the AI with the comment, up to the limit, then to the studio', async () => {
    const { id, editKey } = await projectInDesign();
    await bus.publishEnvelope(layoutGenerated(id, 1));
    await settle();

    const bad = await http('POST', `/projects/${editKey}/layout/changes`, { version: 1, comment: 'да' });
    expect(bad.statusCode).toBe(422);

    // Round 1.
    let res = await http('POST', `/projects/${editKey}/layout/changes`, { version: 1, comment: 'Поменяйте заголовок на обложке' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'in_design', layout: { status: 'changes_requested', feedback: 'Поменяйте заголовок на обложке' }, design: { mode: 'auto', revisionsUsed: 1 } });
    await settle();
    const revision = published('projects.revision_requested', id).at(-1)!;
    expect(revision.data).toMatchObject({
      projectId: id,
      revision: 1,
      layoutVersion: 1,
      comment: 'Поменяйте заголовок на обложке',
      draft: { title: 'Айгерим', sections: [{ heading: 'Интервью' }] },
      answers: { hero: { name: 'Айгерим' } },
    });
    expect((await http('GET', `/internal/projects/${id}/layout-source`)).json().nextVersion).toBe(2);

    // The AI answers, the layout service delivers version 2; round 2.
    await bus.publishEnvelope(layoutGenerated(id, 2));
    await settle();
    expect((await view(editKey)).status).toBe('awaiting_approval');
    res = await http('POST', `/projects/${editKey}/layout/changes`, { version: 2, comment: 'Уберите историю Ерлана' });
    expect(res.json().design.revisionsUsed).toBe(2);
    await settle();
    expect(published('projects.revision_requested', id)).toHaveLength(2);

    // Version 3, then a third request: past the limit of 2, a designer takes over.
    await bus.publishEnvelope(layoutGenerated(id, 3));
    await settle();
    res = await http('POST', `/projects/${editKey}/layout/changes`, { version: 3, comment: 'Всё ещё не то, хочу другое фото' });
    expect(res.json()).toMatchObject({ status: 'in_design', design: { mode: 'studio', revisionsUsed: 2 } });
    await settle();
    expect(published('projects.revision_requested', id)).toHaveLength(2);
    const handoff = published('projects.design_handoff', id);
    expect(handoff).toHaveLength(1);
    expect((handoff[0]!.data as { reason: string }).reason).toMatch(/Лимит автоматических правок исчерпан.*другое фото/);

    // A late automatic layout no longer reaches the customer.
    await bus.publishEnvelope(layoutGenerated(id, 4));
    await settle();
    const project = await view(editKey);
    expect(project.status).toBe('in_design');
    expect(project.layout).toMatchObject({ version: 4, status: 'discarded' });
    expect((await http('GET', `/internal/projects/${id}/layout-source`)).json().designMode).toBe('studio');

    // The studio finishes by hand: the old flow (manual awaiting_approval, pay without an automatic layout) still works.
    await http('POST', `/admin/projects/${id}/status`, { to: 'awaiting_approval', note: 'Макет от дизайнера' });
    expect((await http('POST', `/projects/${editKey}/checkout`, { kind: 'balance' })).statusCode).toBe(200);
    const history = (await view(editKey)).history.map((h: { to: string }) => h.to);
    expect(history).toEqual(['draft', 'deposit_paid', 'in_design', 'awaiting_approval', 'in_design', 'awaiting_approval', 'in_design', 'awaiting_approval', 'in_design', 'awaiting_approval']);
  });

  it('hands the project to the studio when the layout service gives up', async () => {
    const { id, editKey } = await projectInDesign();
    const failed = createEnvelope('layout.failed', { projectId: id, version: 1, reason: 'media unavailable' });
    await bus.publishEnvelope(failed);
    await bus.publishEnvelope(failed);
    await settle();
    const project = await view(editKey);
    expect(project).toMatchObject({ status: 'in_design', design: { mode: 'studio' } });
    const handoff = published('projects.design_handoff', id);
    expect(handoff).toHaveLength(1);
    expect((handoff[0]!.data as { reason: string }).reason).toContain('media unavailable');
  });
});
