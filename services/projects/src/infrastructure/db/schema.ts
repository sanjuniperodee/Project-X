import type { Answers, Customer, Draft, EventEnvelope, ProductId, ProjectStatus, Quote } from '@px/contracts';
import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
};

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey(),
    productId: text('product_id').$type<ProductId>().notNull(),
    subject: text('subject').notNull(),
    status: text('status').$type<ProjectStatus>().notNull(),
    quote: jsonb('quote').$type<Quote>().notNull(),
    customer: jsonb('customer').$type<Customer>().notNull(),
    answers: jsonb('answers').$type<Answers>().notNull().default({}),
    draft: jsonb('draft').$type<Draft>(),
    editKey: text('edit_key').notNull().unique(),
    inviteKey: text('invite_key').notNull().unique(),
    paidAmount: integer('paid_amount').notNull().default(0),
    ...timestamps,
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
  },
  (t) => [index('projects_status_updated_idx').on(t.status, t.updatedAt)],
);

export const contributions = pgTable(
  'contributions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    authorName: text('author_name').notNull(),
    answers: jsonb('answers').$type<Answers>().notNull(),
    ...timestamps,
  },
  (t) => [index('contributions_project_idx').on(t.projectId, t.createdAt)],
);

export const statusChanges = pgTable(
  'status_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    from: text('from_status').$type<ProjectStatus>(),
    to: text('to_status').$type<ProjectStatus>().notNull(),
    note: text('note'),
    ...timestamps,
  },
  (t) => [index('status_changes_project_idx').on(t.projectId, t.createdAt)],
);

/** Transactional outbox: events are committed together with state and published by the relay. */
export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').primaryKey(),
    type: text('type').notNull(),
    envelope: jsonb('envelope').$type<EventEnvelope>().notNull(),
    ...timestamps,
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [index('outbox_unpublished_idx').on(t.createdAt).where(sql`published_at IS NULL`)],
);

/** Incoming events already handled — makes at-least-once delivery effectively exactly-once. */
export const processedEvents = pgTable('processed_events', {
  eventId: text('event_id').primaryKey(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

