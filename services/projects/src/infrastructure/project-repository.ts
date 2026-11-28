import type { EventEnvelope } from '@px/contracts';
import type { OutboxStore } from '@px/service-kit';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { ContributionRecord, ProjectRepository, ProjectTransaction, StatusChangeRecord } from '../application/ports';
import type { Layout } from '../domain/layout';
import type { Project, StatusChange } from '../domain/project';
import type { Database } from './db/client';
import { contributions, layouts, outbox, processedEvents, projects, statusChanges } from './db/schema';

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];
type ProjectRow = typeof projects.$inferSelect;

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    productId: row.productId,
    subject: row.subject,
    status: row.status,
    quote: row.quote,
    customer: row.customer,
    answers: row.answers,
    draft: row.draft ?? null,
    editKey: row.editKey,
    inviteKey: row.inviteKey,
    paidAmount: row.paidAmount,
    designMode: row.designMode,
    revisionsUsed: row.revisionsUsed,
    reopened: row.reopened,
    deadline: row.deadline ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    submittedAt: row.submittedAt,
  };
}

function toLayout(row: typeof layouts.$inferSelect): Layout {
  return {
    projectId: row.projectId,
    version: row.version,
    status: row.status,
    pdfUrl: row.pdfUrl,
    pages: row.pages,
    template: row.template,
    warnings: row.warnings,
    feedback: row.feedback,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
  };
}

function toRow(project: Project): typeof projects.$inferInsert {
  return { ...project };
}

class DrizzleProjectTransaction implements ProjectTransaction {
  constructor(private readonly tx: Executor) {}

  async lock(by: { id: string } | { editKey: string }): Promise<Project | null> {
    const condition = 'id' in by ? eq(projects.id, by.id) : eq(projects.editKey, by.editKey);
    const [row] = await this.tx.select().from(projects).where(condition).for('update');
    return row ? toProject(row) : null;
  }

  async insert(project: Project): Promise<void> {
    await this.tx.insert(projects).values(toRow(project));
  }

  async update(project: Project): Promise<void> {
    const { id, ...values } = toRow(project);
    await this.tx.update(projects).set(values).where(eq(projects.id, id!));
  }

  async addContribution(input: Omit<ContributionRecord, 'id' | 'createdAt'>): Promise<ContributionRecord> {
    const [row] = await this.tx.insert(contributions).values(input).returning();
    return row!;
  }

  async recordStatusChange(projectId: string, change: StatusChange): Promise<void> {
    await this.tx.insert(statusChanges).values({ projectId, ...change });
  }

  async enqueue(envelope: EventEnvelope): Promise<void> {
    await this.tx.insert(outbox).values({ id: envelope.id, type: envelope.type, envelope });
  }

  async latestLayout(projectId: string): Promise<Layout | null> {
    const [row] = await this.tx
      .select()
      .from(layouts)
      .where(eq(layouts.projectId, projectId))
      .orderBy(desc(layouts.version))
      .limit(1)
      .for('update');
    return row ? toLayout(row) : null;
  }

  async insertLayout(layout: Layout): Promise<boolean> {
    const inserted = await this.tx.insert(layouts).values(layout).onConflictDoNothing().returning({ id: layouts.id });
    return inserted.length > 0;
  }

  async updateLayout(layout: Layout): Promise<void> {
    await this.tx
      .update(layouts)
      .set({ status: layout.status, feedback: layout.feedback, decidedAt: layout.decidedAt })
      .where(and(eq(layouts.projectId, layout.projectId), eq(layouts.version, layout.version)));
  }

  async markProcessed(eventId: string): Promise<boolean> {
    const inserted = await this.tx
      .insert(processedEvents)
      .values({ eventId })
      .onConflictDoNothing()
      .returning({ eventId: processedEvents.eventId });
    return inserted.length > 0;
  }
}

export class DrizzleProjectRepository implements ProjectRepository {
  constructor(private readonly db: Database) {}

  transaction<T>(work: (tx: ProjectTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new DrizzleProjectTransaction(tx)));
  }

  async findById(id: string) {
    return this.findOne(eq(projects.id, id));
  }

  async findByEditKey(editKey: string) {
    return this.findOne(eq(projects.editKey, editKey));
  }

  async findByInviteKey(inviteKey: string) {
    return this.findOne(eq(projects.inviteKey, inviteKey));
  }

  async contributions(projectId: string): Promise<ContributionRecord[]> {
    return this.db
      .select()
      .from(contributions)
      .where(eq(contributions.projectId, projectId))
      .orderBy(asc(contributions.createdAt));
  }

  async countContributions(projectId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(contributions)
      .where(eq(contributions.projectId, projectId));
    return row?.value ?? 0;
  }

  async history(projectId: string): Promise<StatusChangeRecord[]> {
    return this.db
      .select({ from: statusChanges.from, to: statusChanges.to, note: statusChanges.note, createdAt: statusChanges.createdAt })
      .from(statusChanges)
      .where(eq(statusChanges.projectId, projectId))
      .orderBy(asc(statusChanges.createdAt));
  }

  async layouts(projectId: string): Promise<Layout[]> {
    const rows = await this.db.select().from(layouts).where(eq(layouts.projectId, projectId)).orderBy(desc(layouts.version));
    return rows.map(toLayout);
  }

  private async findOne(condition: ReturnType<typeof eq>) {
    const [row] = await this.db.select().from(projects).where(condition).limit(1);
    return row ? toProject(row) : null;
  }
}

export class DrizzleOutboxStore implements OutboxStore {
  constructor(private readonly db: Database) {}

  withClaimedBatch(limit: number, publish: (envelopes: EventEnvelope[]) => Promise<string[]>): Promise<number> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: outbox.id, envelope: outbox.envelope })
        .from(outbox)
        .where(isNull(outbox.publishedAt))
        .orderBy(asc(outbox.createdAt))
        .limit(limit)
        .for('update', { skipLocked: true });
      if (rows.length === 0) return 0;

      const published = await publish(rows.map((r) => r.envelope));
      if (published.length > 0) {
        await tx
          .update(outbox)
          .set({ publishedAt: new Date() })
          .where(and(inArray(outbox.id, published), isNull(outbox.publishedAt)));
      }
      return published.length;
    });
  }
}
