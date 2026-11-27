import type { Payment } from '../domain/payment';

export interface CheckoutSession {
  redirectUrl: string;
  externalId: string;
}

export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
}

export interface WebhookResult {
  externalId: string;
  outcome: 'succeeded' | 'failed' | 'cancelled';
}

/**
 * Adapter for a payment provider (Kaspi Pay, Freedom Pay, CloudPayments, …).
 * To add one: implement this interface in a new file and register it in providers/index.ts.
 */
export interface PaymentProvider {
  readonly id: string;
  createCheckout(payment: Payment): Promise<CheckoutSession>;
  /** Verifies the signature and extracts the result. Throws on an invalid request. */
  parseWebhook(request: WebhookRequest): Promise<WebhookResult>;
  /** Test providers allow settling payments from the checkout page. */
  readonly supportsManualConfirmation: boolean;
}
