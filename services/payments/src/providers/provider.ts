import type { Payment } from '../domain/payment';

export interface CheckoutSession {
  redirectUrl: string;
  externalId: string;
}

/** What the provider may need to start a checkout that is not part of the stored payment. */
export interface CheckoutContext {
  /** Customer phone as entered in the order; invoice providers (Kaspi Pay) bill it. */
  customerPhone?: string;
}

export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
}

export type PaymentOutcome = 'succeeded' | 'failed' | 'cancelled';

export interface WebhookResult {
  externalId: string;
  /** null: the notification carries no final result (e.g. "lost"); the status is re-checked via `fetchOutcome`. */
  outcome: PaymentOutcome | null;
}

/**
 * Adapter for a payment provider (Kaspi Pay, Freedom Pay, CloudPayments, …).
 * To add one: implement this interface in a new file and register it in providers/index.ts.
 */
export interface PaymentProvider {
  readonly id: string;
  createCheckout(payment: Payment, context: CheckoutContext): Promise<CheckoutSession>;
  /**
   * Verifies the signature and extracts the result. Throws on an invalid request.
   * Returns null for a valid notification that is not about a payment of this service
   * (a provider account shared with other shops sends every notification to every subscriber).
   */
  parseWebhook(request: WebhookRequest): Promise<WebhookResult | null>;
  /**
   * Asks the provider for the current status. When present, it is the source of truth: webhooks only
   * trigger a check, and pending payments are reconciled periodically in case a notification was lost.
   */
  fetchOutcome?(externalId: string): Promise<PaymentOutcome | 'pending'>;
  /** Test providers allow settling payments from the checkout page. */
  readonly supportsManualConfirmation: boolean;
}
