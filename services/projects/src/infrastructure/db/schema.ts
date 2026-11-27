import type { Answers, Customer, DesignMode, Draft, EventEnvelope, LayoutPage, LayoutStatus, ProductId, ProjectStatus, Quote } from '@px/contracts';
import { sql } from 'drizzle-orm';
import { date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
    designMode: text('design_mode').$type<DesignMode>().notNull().default('auto'),
    revisionsUsed: integer('revisions_used').notNull().default(0),
    deadline: date('deadline', { mode: 'string' }),
    ...timestamps,
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
  },
  (t) => [index('projects_status_updated_idx').on(t.status, t.updatedAt), index('projects_deadline_idx').on(t.deadline)],
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

/** Layout versions made by the layout service, with the customer's decision on each. */
export const layouts = pgTable(
  'layouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: text('status').$type<LayoutStatus>().notNull(),
    pdfUrl: text('pdf_url').notNull(),
    pages: jsonb('pages').$type<LayoutPage[]>().notNull(),
    template: text('template').notNull(),
    warnings: jsonb('warnings').$type<string[]>().notNull().default([]),
    feedback: text('feedback'),
    ...timestamps,
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  // One row per version: a redelivered layout.generated cannot create a duplicate.
  (t) => [uniqueIndex('layouts_project_version_idx').on(t.projectId, t.version)],
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

/** Internal notes of the studio on a project (calls, agreements, reminders). */
export const projectNotes = pgTable(
  'project_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    author: text('author'),
    ...timestamps,
  },
  (t) => [index('project_notes_project_idx').on(t.projectId, t.createdAt)],
);
