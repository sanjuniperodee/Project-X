import { AppError } from '@px/service-kit';
import type { Payment } from '../../domain/payment';
import type { CheckoutContext, CheckoutSession, PaymentOutcome, PaymentProvider, WebhookRequest, WebhookResult } from '../provider';
import type { KaspiPosClient } from './kaspi-pos-client';
import { kaspiOutcome, kaspiPhone, parseKaspiOperation, parseKaspiWebhook, verifyKaspiSignature } from './kaspi-protocol';

export interface KaspiOptions {
  client: KaspiPosClient;
  /** Secret of this service's entry in kaspi-pos webhooks.json. */
  webhookSecret: string;
  frontendUrl: string;
}

/**
 * Kaspi Pay through the kaspi-pos sidecar: an invoice is pushed to the customer's Kaspi.kz app by phone number.
 * The customer waits on /pay/kaspi/<id>, which follows the payment status until it settles.
 */
export class KaspiPaymentProvider implements PaymentProvider {
  readonly id = 'kaspi';
  readonly supportsManualConfirmation = false;

  constructor(private readonly options: KaspiOptions) {}

  async createCheckout(payment: Payment, context: CheckoutContext): Promise<CheckoutSession> {
    const phone = kaspiPhone(context.customerPhone);
    if (!phone) {
      throw AppError.badRequest('Счёт Kaspi выставляется на мобильный номер Казахстана. Укажите в заказе номер, привязанный к Kaspi.kz');
    }
    const body = await this.options.client.call('/api/invoice/create', 'write', {
      json: { phoneNumber: phone, amount: payment.amount, comment: payment.description.slice(0, 120) },
    });
    const op = parseKaspiOperation(body);
    if (op.statusCode !== 0 || !op.id) {
      throw new AppError('unavailable', 'Kaspi не принял счёт. Проверьте, что номер привязан к Kaspi.kz, и попробуйте ещё раз');
    }
    return { externalId: op.id, redirectUrl: new URL(`/pay/kaspi/${payment.id}`, this.options.frontendUrl).toString() };
  }

  async parseWebhook(request: WebhookRequest): Promise<WebhookResult | null> {
    const signature = request.headers['x-webhook-signature'];
    if (!verifyKaspiSignature(request.rawBody, Array.isArray(signature) ? signature[0] : signature, this.options.webhookSecret)) {
      throw new Error('bad signature');
    }
    return parseKaspiWebhook(JSON.parse(request.rawBody.toString('utf8')));
  }

  async fetchOutcome(externalId: string): Promise<PaymentOutcome | 'pending'> {
    const body = await this.options.client.call(`/api/invoice/details?operationId=${encodeURIComponent(externalId)}`, 'read');
    return kaspiOutcome(parseKaspiOperation(body).status);
  }
}
