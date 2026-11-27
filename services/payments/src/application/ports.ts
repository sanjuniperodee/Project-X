import type { EventEnvelope } from '@px/contracts';
import type { Payment } from '../domain/payment';

export interface PaymentTransaction {
  lock(by: { id: string } | { provider: string; externalId: string }): Promise<Payment | null>;
  insert(payment: Payment): Promise<void>;
  update(payment: Payment): Promise<void>;
  enqueue(envelope: EventEnvelope): Promise<void>;
}

export interface PaymentRepository {
  transaction<T>(work: (tx: PaymentTransaction) => Promise<T>): Promise<T>;
  findById(id: string): Promise<Payment | null>;
}
