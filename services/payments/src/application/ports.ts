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
  findByExternalId(provider: string, externalId: string): Promise<Payment | null>;
  /** Pending payments of the provider created after `since`, oldest first. */
  listPending(provider: string, since: Date): Promise<Payment[]>;
  /** Every payment of a project, newest first. */
  listByProject(projectId: string): Promise<Payment[]>;
}

/** Key-value settings of the service. Values are opaque strings; encryption is the store's concern. */
export interface SettingsStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string | null): Promise<void>;
}
