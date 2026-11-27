import { desc, eq, sql } from 'drizzle-orm';
import type { ConversationRepository } from '../application/ports';
import type { ChatMessage, Conversation, LinkedProject } from '../domain/conversation';
import type { Database } from './db/client';
import { conversationProjects, conversations, messages, processedEvents } from './db/schema';

export class DrizzleConversationRepository implements ConversationRepository {
  constructor(private readonly db: Database) {}

  async findByChat(chatId: string) {
    const [row] = await this.db.select().from(conversations).where(eq(conversations.chatId, chatId)).limit(1);
    return (row as Conversation | undefined) ?? null;
  }

  async get(id: string) {
    const [row] = await this.db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return (row as Conversation | undefined) ?? null;
  }

  async insert(c: Conversation) {
    // Two webhooks for a new chat at once: the second one reuses the row.
    await this.db.insert(conversations).values(c).onConflictDoNothing({ target: conversations.chatId });
    const stored = await this.findByChat(c.chatId);
    if (stored) Object.assign(c, stored);
  }

  async update(c: Conversation) {
    const { id, ...values } = c;
    await this.db.update(conversations).set(values).where(eq(conversations.id, id));
  }

  async addMessage(m: ChatMessage) {
    const rows = await this.db.insert(messages).values(m).onConflictDoNothing().returning({ id: messages.id });
    return rows.length > 0;
  }

  async isOurMessage(externalId: string) {
    const [row] = await this.db
      .select({ author: messages.author })
      .from(messages)
      .where(eq(messages.externalId, externalId))
      .limit(1);
    return !!row && row.author !== 'customer';
  }

  async history(conversationId: string, limit: number) {
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    return (rows as ChatMessage[]).reverse();
  }

  async linkProject(p: LinkedProject) {
    await this.db.insert(conversationProjects).values(p).onConflictDoNothing();
  }

  async projects(conversationId: string) {
    const rows = await this.db
      .select()
      .from(conversationProjects)
      .where(eq(conversationProjects.conversationId, conversationId))
      .orderBy(conversationProjects.createdAt);
    return rows as LinkedProject[];
  }

  async projectLink(projectId: string) {
    const [row] = await this.db.select().from(conversationProjects).where(eq(conversationProjects.projectId, projectId)).limit(1);
    return (row as LinkedProject | undefined) ?? null;
  }

  async pending() {
    return (await this.db.select().from(conversations).where(eq(conversations.pending, true))) as Conversation[];
  }

  async list(limit: number) {
    const rows = await this.db
      .select({
        conversation: conversations,
        lastMessage: sql<string | null>`(select m.text from ${messages} m where m.conversation_id = ${conversations.id} order by m.created_at desc limit 1)`,
        projectsCount: sql<number>`(select count(*)::int from ${conversationProjects} p where p.conversation_id = ${conversations.id})`,
      })
      .from(conversations)
      .orderBy(desc(conversations.lastMessageAt))
      .limit(limit);
    return rows.map((r) => ({ conversation: r.conversation as Conversation, lastMessage: r.lastMessage, projectsCount: Number(r.projectsCount) }));
  }

  async markProcessed(eventId: string) {
    const rows = await this.db.insert(processedEvents).values({ eventId }).onConflictDoNothing().returning({ id: processedEvents.eventId });
    return rows.length > 0;
  }
}

