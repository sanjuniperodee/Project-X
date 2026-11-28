import { z } from 'zod';

/** Studio WhatsApp number, linked to the GOWA gateway by QR. */
export const WhatsAppStatus = z.object({
  /** false: GOWA is not configured for this environment. */
  enabled: z.boolean(),
  reachable: z.boolean(),
  loggedIn: z.boolean(),
  /** Linked number, digits. */
  phone: z.string().nullable(),
  /** The AI seller answers customers (ANTHROPIC_API_KEY set and not switched off). */
  botEnabled: z.boolean(),
  problem: z.string().nullable(),
});
export type WhatsAppStatus = z.infer<typeof WhatsAppStatus>;

export const WhatsAppQr = z.object({
  /** data:image/png;base64,… */
  image: z.string(),
  seconds: z.number().int().positive(),
});

export const ConversationMode = z.enum(['bot', 'human']);

export const ConversationSummary = z.object({
  id: z.string(),
  chatId: z.string(),
  phone: z.string().nullable(),
  name: z.string(),
  mode: ConversationMode,
  handoffReason: z.string().nullable(),
  lastMessage: z.string().nullable(),
  lastMessageAt: z.iso.datetime(),
  projectsCount: z.number().int().nonnegative(),
});
export type ConversationSummary = z.infer<typeof ConversationSummary>;

export const ConversationList = z.object({ items: z.array(ConversationSummary) });

export const ConversationMessage = z.object({
  id: z.string(),
  author: z.enum(['customer', 'bot', 'studio', 'system']),
  text: z.string(),
  createdAt: z.iso.datetime(),
});

export const ConversationView = ConversationSummary.extend({
  messages: z.array(ConversationMessage),
  projects: z.array(z.object({ projectId: z.string(), productId: z.string(), editKey: z.string() })),
});
export type ConversationView = z.infer<typeof ConversationView>;

/** Studio reply from /admin (goes out from the studio number; the bot pauses for this chat). */
export const StudioReplyRequest = z.object({ text: z.string().trim().min(1).max(4000) });
export const SetConversationModeRequest = z.object({ mode: ConversationMode });

/** Try the AI seller from /admin: the real model and catalog, orders and invoices are not created. */
export const SellerTrialRequest = z.object({
  messages: z
    .array(z.object({ author: z.enum(['customer', 'bot']), text: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(30),
});
export const SellerTrialResponse = z.object({ reply: z.string().nullable(), actions: z.array(z.string()) });

/** WhatsApp Business catalog of the studio: one WhatsApp product per product format. */
export const WaReview = z.enum(['none', 'pending', 'approved', 'rejected', 'outdated', 'unknown']);
export const CatalogItemStatus = z.object({
  productId: z.string(),
  formatId: z.string(),
  name: z.string(),
  price: z.number().int(),
  /** WhatsApp product id; null — not in the catalog yet. */
  waProductId: z.string().nullable(),
  review: WaReview,
  /** Price/name/description differ from our catalog: the next sync edits it. */
  outdated: z.boolean(),
});
export const CatalogProductPhotos = z.object({
  productId: z.string(),
  productName: z.string(),
  images: z.array(z.string()),
  /** Photos changed since the last sync. */
  pending: z.boolean(),
});
export const CatalogStatus = z.object({
  /** The gateway has the catalog build and the number is linked. */
  available: z.boolean(),
  problem: z.string().nullable(),
  catalogUrl: z.string().nullable(),
  lastSyncAt: z.iso.datetime().nullable(),
  products: z.array(CatalogProductPhotos),
  items: z.array(CatalogItemStatus),
});
export type CatalogStatus = z.infer<typeof CatalogStatus>;
export const CatalogPhotosRequest = z.object({
  images: z.array(z.string().regex(/^\/api\/media\/files\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/, 'Фото: JPEG, PNG или WebP из загрузки')).max(10),
});
export const CatalogSyncResult = z.object({
  created: z.number().int(),
  updated: z.number().int(),
  removed: z.number().int(),
  unchanged: z.number().int(),
  skipped: z.array(z.string()),
  status: CatalogStatus,
});
