import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/** One WhatsApp chat with a customer (chat id: phone digits, or a hidden-number LID). */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey(),
    chatId: text('chat_id').notNull(),
    /** Digits, null for hidden numbers (LID). */
    phone: text('phone'),
    name: text('name').notNull().default(''),
    /** bot: the AI seller answers; human: the studio took over (until botPausedUntil, or for good when null). */
    mode: text('mode').$type<'bot' | 'human'>().notNull().default('bot'),
    botPausedUntil: timestamp('bot_paused_until', { withTimezone: true }),
    handoffReason: text('handoff_reason'),
    /** Unanswered customer messages are waiting for the bot. */
    pending: boolean('pending').notNull().default(false),
    botTurns: integer('bot_turns').notNull().default(0),
    /** Reminders sent since the customer last wrote (MyBooks ladder: warm 20 min / 3 h / next day, cold 3 h / next day). */
    followUps: integer('follow_ups').notNull().default(0),
    lastCustomerAt: timestamp('last_customer_at', { withTimezone: true }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('conversations_chat_idx').on(t.chatId), index('conversations_pending_idx').on(t.pending)],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id').notNull(),
    /** customer, bot, studio (human from the phone or /admin), system (notifications). */
    author: text('author').$type<'customer' | 'bot' | 'studio' | 'system'>().notNull(),
    text: text('text').notNull(),
    /** WhatsApp message id: dedupe of webhooks and recognising our own echoes. */
    externalId: text('external_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt), uniqueIndex('messages_external_idx').on(t.externalId)],
);

/** Orders the bot created or that belong to this customer's phone. */
export const conversationProjects = pgTable(
  'conversation_projects',
  {
    projectId: text('project_id').primaryKey(),
    conversationId: uuid('conversation_id').notNull(),
    productId: text('product_id').notNull(),
    editKey: text('edit_key').notNull(),
    inviteKey: text('invite_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('conversation_projects_conversation_idx').on(t.conversationId)],
);

/** Idempotent event handling (JetStream delivers at least once). */
export const processedEvents = pgTable('processed_events', {
  eventId: text('event_id').primaryKey(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Photos for the WhatsApp catalog, per product (media URLs). WhatsApp refuses a product without a photo. */
export const catalogPhotos = pgTable('catalog_photos', {
  productId: text('product_id').primaryKey(),
  images: jsonb('images').$type<string[]>().notNull().default([]),
  /** Bumped on every change; equal to syncedVersion once WhatsApp has these photos. */
  version: integer('version').notNull().default(1),
  syncedVersion: integer('synced_version').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Copy of the WhatsApp catalog (refreshed on every sync): what the bot can send as a card. */
export const waProducts = pgTable('wa_products', {
  id: text('id').primaryKey(),
  retailerId: text('retailer_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  price: integer('price'),
  url: text('url').notNull().default(''),
  review: text('review').notNull().default(''),
  imageUrl: text('image_url'),
  imageCount: integer('image_count').notNull().default(0),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
});
