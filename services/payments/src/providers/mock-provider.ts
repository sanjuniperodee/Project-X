import type { Payment } from '../domain/payment';
import type { CheckoutSession, PaymentProvider, WebhookResult } from './provider';

/** Development provider: the customer "pays" on a test page served by the frontend. */
export class MockPaymentProvider implements PaymentProvider {
  readonly id = 'mock';
  readonly supportsManualConfirmation = true;

  constructor(private readonly frontendUrl: string) {}

  async createCheckout(payment: Payment): Promise<CheckoutSession> {
    return {
      externalId: `mock_${payment.id}`,
      redirectUrl: new URL(`/pay/mock/${payment.id}`, this.frontendUrl).toString(),
    };
  }

  async parseWebhook(): Promise<WebhookResult> {
    throw new Error('The mock provider does not send webhooks');
  }
}
