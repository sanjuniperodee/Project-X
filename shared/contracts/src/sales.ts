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
