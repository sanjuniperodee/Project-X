import type { EventEnvelope, PaymentKind, PaymentStatus } from '@px/contracts';
import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey(),
    projectId: text('project_id').notNull(),
    kind: text('kind').$type<PaymentKind>().notNull(),
    amount: integer('amount').notNull(),
    description: text('description').notNull(),
    status: text('status').$type<PaymentStatus>().notNull(),
    provider: text('provider').notNull(),
    externalId: text('external_id'),
    redirectUrl: text('redirect_url').notNull(),
    returnUrl: text('return_url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
  },
  (t) => [
    index('payments_project_idx').on(t.projectId),
    uniqueIndex('payments_provider_external_idx').on(t.provider, t.externalId),
  ],
);

/** Transactional outbox, see projects service for the pattern description. */
export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').primaryKey(),
    type: text('type').notNull(),
    envelope: jsonb('envelope').$type<EventEnvelope>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [index('outbox_unpublished_idx').on(t.createdAt).where(sql`published_at IS NULL`)],
);
