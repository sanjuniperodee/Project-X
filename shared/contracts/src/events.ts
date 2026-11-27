import { z } from 'zod';
import { DraftContent } from './drafts';
import { Answers } from './fields';
import { ProductId } from './products';
import { Contribution, PaymentKind } from './projects';
import { Tenge } from './money';

/**
 * Asynchronous integration events (NATS JetStream).
 *
 * Naming: `<owning service>.<past-tense fact>`. Only the owning service publishes
 * an event; any service may subscribe. Payloads are versioned by adding new event
 * types, never by breaking existing ones.
 */
export const EventCatalog = {
  'projects.submitted': z.object({
    projectId: z.string(),
    productId: ProductId,
    subject: z.string(),
    formatId: z.string(),
    answers: Answers,
    contributions: z.array(Contribution),
  }),
  'projects.status_changed': z.object({
    projectId: z.string(),
    productId: ProductId,
    from: z.string().nullable(),
    to: z.string(),
  }),
  'payments.succeeded': z.object({
    paymentId: z.string(),
    projectId: z.string(),
    kind: PaymentKind,
    amount: Tenge,
  }),
  'ai.draft_generated': z.object({
    projectId: z.string(),
    draft: DraftContent,
    generator: z.string(),
  }),
} as const;

export type EventType = keyof typeof EventCatalog;
export type EventPayload<T extends EventType> = z.infer<(typeof EventCatalog)[T]>;

export interface EventEnvelope<T extends EventType = EventType> {
  /** Unique id; consumers use it for idempotency. */
  id: string;
  type: T;
  occurredAt: string;
  data: EventPayload<T>;
}

export const EVENT_TYPES = Object.keys(EventCatalog) as EventType[];

export function parseEventPayload<T extends EventType>(type: T, data: unknown): EventPayload<T> {
  return EventCatalog[type].parse(data) as EventPayload<T>;
}
