import type { UsageSummary } from '@px/contracts';
import { desc, gte, sql } from 'drizzle-orm';
import { costUsd } from '../domain/pricing';
import type { Database } from './db/client';
import { conversations, llmUsage } from './db/schema';

export interface UsageEntry {
  id: string;
  service: string;
  purpose: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  conversationId?: string | null;
  projectId?: string | null;
  at?: Date;
}

export class UsageStore {
  constructor(private readonly db: Database) {}

  /** Idempotent by id (event ids are reused for the ai service's calls). */
  async record(e: UsageEntry) {
    await this.db
      .insert(llmUsage)
      .values({
        id: e.id,
        at: e.at ?? new Date(),
        service: e.service,
        purpose: e.purpose,
        model: e.model,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        cacheReadTokens: e.cacheReadTokens,
        cacheWriteTokens: e.cacheWriteTokens,
        costMicroUsd: Math.round(costUsd(e) * 1_000_000),
        conversationId: e.conversationId ?? null,
        projectId: e.projectId ?? null,
      })
      .onConflictDoNothing();
  }

  async summary(days: number, now = new Date()): Promise<UsageSummary> {
    const since = new Date(now.getTime() - days * 86_400_000);
    const agg = {
      calls: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${llmUsage.inputTokens}),0)::bigint`,
      outputTokens: sql<number>`coalesce(sum(${llmUsage.outputTokens}),0)::bigint`,
      cacheReadTokens: sql<number>`coalesce(sum(${llmUsage.cacheReadTokens}),0)::bigint`,
      micro: sql<number>`coalesce(sum(${llmUsage.costMicroUsd}),0)::bigint`,
    };
    const row = (key: string, r: { calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; micro: number }) => ({
      key,
      calls: Number(r.calls),
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
      cacheReadTokens: Number(r.cacheReadTokens),
      costUsd: Number(r.micro) / 1_000_000,
    });
    const day = sql<string>`to_char(${llmUsage.at} at time zone 'Asia/Almaty', 'YYYY-MM-DD')`;
    const startOfToday = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(now) + 'T00:00:00+05:00');

    const [total] = await this.db.select(agg).from(llmUsage).where(gte(llmUsage.at, since));
    const [today] = await this.db.select(agg).from(llmUsage).where(gte(llmUsage.at, startOfToday));
    const byDay = await this.db.select({ k: day, ...agg }).from(llmUsage).where(gte(llmUsage.at, since)).groupBy(day).orderBy(desc(day));
    const purposeKey = sql<string>`${llmUsage.service} || '/' || ${llmUsage.purpose}`;
    const byPurpose = await this.db.select({ k: purposeKey, ...agg }).from(llmUsage).where(gte(llmUsage.at, since)).groupBy(purposeKey).orderBy(desc(agg.micro));
    const byModel = await this.db.select({ k: llmUsage.model, ...agg }).from(llmUsage).where(gte(llmUsage.at, since)).groupBy(llmUsage.model).orderBy(desc(agg.micro));
    const convKey = sql<string>`coalesce(${llmUsage.conversationId}::text, 'order:' || ${llmUsage.projectId}, 'other')`;
    const top = await this.db
      .select({ k: convKey, label: sql<string>`max(coalesce(nullif(${conversations.name}, ''), ${conversations.phone}, ${llmUsage.projectId}, '—'))`, ...agg })
      .from(llmUsage)
      .leftJoin(conversations, sql`${conversations.id} = ${llmUsage.conversationId}`)
      .where(gte(llmUsage.at, since))
      .groupBy(convKey)
      .orderBy(desc(agg.micro))
      .limit(10);

    return {
      days,
      total: row('total', total!),
      today: row('today', today!),
      byDay: byDay.map((r) => row(r.k, r)),
      byPurpose: byPurpose.map((r) => row(r.k, r)),
      byModel: byModel.map((r) => row(r.k, r)),
      topConversations: top.map((r) => ({ ...row(r.k, r), label: r.label })),
      note: 'Оценка по публичному прайсу Anthropic (вход, выход, кеш). Точная сумма — в счёте Anthropic. Голос ElevenLabs здесь не учитывается.',
    };
  }
}
