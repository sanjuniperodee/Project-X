import type { EventEnvelope } from '@px/contracts';
import type { OutboxStore } from '@px/service-kit';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { PaymentRepository, PaymentTransaction } from '../application/ports';
import type { Payment } from '../domain/payment';
import type { Database } from './db/client';
import { outbox, payments } from './db/schema';

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

class DrizzlePaymentTransaction implements PaymentTransaction {
  constructor(private readonly tx: Executor) {}

  async lock(by: { id: string } | { provider: string; externalId: string }) {
    const condition =
      'id' in by
        ? eq(payments.id, by.id)
        : and(eq(payments.provider, by.provider), eq(payments.externalId, by.externalId));
    const [row] = await this.tx.select().from(payments).where(condition).for('update');
    return (row as Payment | undefined) ?? null;
  }

  async insert(payment: Payment) {
    await this.tx.insert(payments).values(payment);
  }

  async update(payment: Payment) {
    const { id, ...values } = payment;
    await this.tx.update(payments).set(values).where(eq(payments.id, id));
  }

  async enqueue(envelope: EventEnvelope) {
    await this.tx.insert(outbox).values({ id: envelope.id, type: envelope.type, envelope });
  }
}

export class DrizzlePaymentRepository implements PaymentRepository {
  constructor(private readonly db: Database) {}

  transaction<T>(work: (tx: PaymentTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new DrizzlePaymentTransaction(tx)));
  }

  async findById(id: string) {
    const [row] = await this.db.select().from(payments).where(eq(payments.id, id)).limit(1);
    return (row as Payment | undefined) ?? null;
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
        await tx.update(outbox).set({ publishedAt: new Date() }).where(inArray(outbox.id, published));
      }
      return published.length;
    });
  }
}
