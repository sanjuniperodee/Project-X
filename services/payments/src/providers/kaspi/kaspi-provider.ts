import { AppError } from '@px/service-kit';
import type { Payment } from '../../domain/payment';
import type { CheckoutContext, CheckoutSession, PaymentOutcome, PaymentProvider, WebhookRequest, WebhookResult } from '../provider';
import { kaspiOutcome, kaspiPhone, parseKaspiOperation, parseKaspiWebhook, verifyKaspiSignature } from './kaspi-protocol';

export interface KaspiOptions {
  /** kaspi-pos-automation sidecar, e.g. http://127.0.0.1:3032. */
  apiUrl: string;
  /** Cashier session issued by kaspi-pos after the SMS login (sent as X-Token-SN / X-Vtoken-Secret / X-Profile-Id). */
  tokenSn: string;
  vtokenSecret: string;
  profileId?: number;
  /** Secret of this service's entry in kaspi-pos webhooks.json. */
  webhookSecret: string;
  frontendUrl: string;
  fetchImpl?: typeof fetch;
}

const TIMEOUT_MS = { write: 15_000, read: 8_000 } as const;

/**
 * Kaspi Pay through the kaspi-pos sidecar: an invoice is pushed to the customer's Kaspi.kz app by phone number.
 * The customer waits on /pay/kaspi/<id>, which follows the payment status until it settles.
 */
export class KaspiPaymentProvider implements PaymentProvider {
  readonly id = 'kaspi';
  readonly supportsManualConfirmation = false;
  private readonly fetch: typeof fetch;

  constructor(private readonly options: KaspiOptions) {
    this.fetch = options.fetchImpl ?? ((...args) => fetch(...args));
  }

  async createCheckout(payment: Payment, context: CheckoutContext): Promise<CheckoutSession> {
    const phone = kaspiPhone(context.customerPhone);
    if (!phone) {
      throw AppError.badRequest('Счёт Kaspi выставляется на мобильный номер Казахстана. Укажите в заказе номер, привязанный к Kaspi.kz');
    }
    const body = await this.call('/api/invoice/create', 'write', {
      phoneNumber: phone,
      amount: payment.amount,
      comment: payment.description.slice(0, 120),
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
    const body = await this.call(`/api/invoice/details?operationId=${encodeURIComponent(externalId)}`, 'read');
    return kaspiOutcome(parseKaspiOperation(body).status);
  }

  private async call(path: string, kind: keyof typeof TIMEOUT_MS, json?: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      'X-Token-SN': this.options.tokenSn,
      'X-Vtoken-Secret': this.options.vtokenSecret,
    };
    if (this.options.profileId) headers['X-Profile-Id'] = String(this.options.profileId);
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await this.fetch(`${this.options.apiUrl.replace(/\/+$/, '')}${path}`, {
        method: json === undefined ? 'GET' : 'POST',
        headers,
        body: json === undefined ? undefined : JSON.stringify(json),
        signal: AbortSignal.timeout(TIMEOUT_MS[kind]),
      });
    } catch (error) {
      throw new AppError('unavailable', `Kaspi временно недоступен (${(error as Error).message})`);
    }
    const text = await res.text();
    if (!res.ok) {
      // 401: kaspi-pos rejected the cashier session — the cashier has to log in again (same session as MyBooks).
      throw new AppError('unavailable', `Kaspi временно недоступен (kaspi-pos ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 160)})`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new AppError('unavailable', 'Kaspi временно недоступен (ответ не JSON)');
    }
  }
}
