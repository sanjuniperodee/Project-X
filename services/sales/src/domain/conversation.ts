import type { ProductId } from '@px/contracts';

export type ConversationMode = 'bot' | 'human';
export type Author = 'customer' | 'bot' | 'studio' | 'system';

export interface Conversation {
  id: string;
  chatId: string;
  phone: string | null;
  name: string;
  mode: ConversationMode;
  botPausedUntil: Date | null;
  handoffReason: string | null;
  pending: boolean;
  botTurns: number;
  lastMessageAt: Date;
  createdAt: Date;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  author: Author;
  text: string;
  externalId: string | null;
  createdAt: Date;
}

export interface LinkedProject {
  projectId: string;
  conversationId: string;
  productId: ProductId;
  editKey: string;
  inviteKey: string;
}

/** Limits that keep the bot from looping with a customer or a spam bot. */
export const BOT_LIMITS = {
  /** Bot replies per conversation before it hands the chat to the studio. */
  maxTurns: 40,
  /** A studio reply from the phone pauses the bot in that chat for this long. */
  humanPauseHours: 12,
  /** Messages of history the model sees. */
  historyMessages: 40,
  /** Customer messages within this window are answered together. */
  debounceMs: 6000,
} as const;

/** Whether the AI seller may answer in this chat right now. */
export function botMayAnswer(c: Pick<Conversation, 'mode' | 'botPausedUntil' | 'botTurns'>, now = new Date()): boolean {
  if (c.botTurns >= BOT_LIMITS.maxTurns) return false;
  if (c.mode === 'bot') return true;
  // Paused by a studio reply: the bot comes back after the pause; a hand-off (no end date) stays with the studio.
  return c.botPausedUntil !== null && c.botPausedUntil <= now;
}

/** Studio replied from its own phone: the bot steps back in this chat for a while. */
export function pauseForHuman(c: Conversation, now = new Date()) {
  c.mode = 'human';
  c.botPausedUntil = new Date(now.getTime() + BOT_LIMITS.humanPauseHours * 3600_000);
}

/** The bot cannot help (or the customer asked for a person): the studio owns the chat until it gives it back. */
export function handOff(c: Conversation, reason: string) {
  c.mode = 'human';
  c.botPausedUntil = null;
  c.handoffReason = reason.slice(0, 500);
}

/** WhatsApp chat id: phone digits for normal chats, the full JID for hidden numbers (LID). */
export function chatIdFromJid(jid: string): string {
  const [user = '', server] = jid.split('@');
  return server === 's.whatsapp.net' ? user.split(':')[0]! : jid;
}

export function jidFromChatId(chatId: string): string {
  return chatId.includes('@') ? chatId : `${chatId.replace(/\D/g, '')}@s.whatsapp.net`;
}

export const phoneFromChatId = (chatId: string) => (/^\d{10,15}$/.test(chatId) ? chatId : null);

/** Project phones are stored as entered (+7…, 8…); chats are digits with the country code. */
export function normalizePhone(raw: string | null | undefined): string | null {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`;
  else if (d.length === 10) d = `7${d}`;
  return /^\d{11,15}$/.test(d) ? d : null;
}
