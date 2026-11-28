import { z } from 'zod';
import { DraftContent } from './drafts';
import { Answers } from './fields';
import { LayoutPage } from './layouts';
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
const SubmittedMaterials = z.object({
  projectId: z.string(),
  productId: ProductId,
  subject: z.string(),
  formatId: z.string(),
  answers: Answers,
  contributions: z.array(Contribution),
});

/** One call to a language model: tokens and the estimated cost (the studio's AI spend in /admin). */
export const LlmUsage = z.object({
  /** Service and what the call was for: ai/draft, ai/revision, sales/reply… */
  service: z.string(),
  purpose: z.string(),
  model: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  projectId: z.string().nullable(),
});
export type LlmUsage = z.infer<typeof LlmUsage>;

export const EventCatalog = {
  /** The ai service called a model (drafts, revisions). Sales records its own calls directly. */
  'ai.llm_used': LlmUsage,
  'projects.submitted': SubmittedMaterials,
  /** The customer asked for changes to a layout: ai rewrites the draft, layout typesets the next version. */
  'projects.revision_requested': SubmittedMaterials.extend({
    /** 1 for the first round of changes. */
    revision: z.number().int().positive(),
    layoutVersion: z.number().int().positive(),
    comment: z.string(),
    /** The draft the rejected layout was built from. */
    draft: DraftContent,
  }),
  'projects.layout_approved': z.object({
    projectId: z.string(),
    productId: ProductId,
    version: z.number().int().positive(),
  }),
  /** Automatic design stopped (revision limit, layout failure): a person in the studio takes over. */
  'projects.design_handoff': z.object({
    projectId: z.string(),
    productId: ProductId,
    reason: z.string(),
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
    /** Set when the draft answers `projects.revision_requested`. */
    revision: z.number().int().positive().optional(),
  }),
  'layout.generated': z.object({
    projectId: z.string(),
    version: z.number().int().positive(),
    pdfUrl: z.string().min(1),
    pages: z.array(LayoutPage).min(1),
    /** Template id and revision, e.g. "glossy-magazine@1". */
    template: z.string(),
    warnings: z.array(z.string()),
  }),
  /** The layout could not be produced even after retries. */
  'layout.failed': z.object({
    projectId: z.string(),
    /** Unknown when even the project could not be loaded. */
    version: z.number().int().positive().optional(),
    reason: z.string(),
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
