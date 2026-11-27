import { randomUUID } from 'node:crypto';
import type { CreatePaymentRequest, PaymentView } from '@px/contracts';
import { AppError, createEnvelope } from '@px/service-kit';
import { settle, type Payment } from '../domain/payment';
import type { PaymentProvider } from '../providers';
import type { PaymentOutcome, WebhookRequest } from '../providers/provider';
import type { PaymentRepository, PaymentTransaction } from './ports';

export class PaymentService {
  constructor(
    private readonly repository: PaymentRepository,
    private readonly provider: PaymentProvider,
  ) {}

  /** Internal: called by the projects service, which computes the amount. */
  async create(request: CreatePaymentRequest): Promise<PaymentView> {
    const { customerPhone, ...stored } = request;
    const payment: Payment = {
      id: randomUUID(),
      ...stored,
      status: 'pending',
      provider: this.provider.id,
      externalId: null,
      redirectUrl: '',
      createdAt: new Date(),
      paidAt: null,
    };
    const session = await this.provider.createCheckout(payment, { customerPhone });
    payment.externalId = session.externalId;
    payment.redirectUrl = session.redirectUrl;

    await this.repository.transaction((tx) => tx.insert(payment));
    return toView(payment);
  }

  async get(id: string): Promise<PaymentView> {
    const payment = await this.repository.findById(id);
    if (!payment) throw AppError.notFound('Платёж');
    return toView(payment);
  }

  /** Test checkout page action. Disabled for real providers. */
  async confirmManually(id: string, outcome: 'success' | 'fail'): Promise<PaymentView> {
    if (!this.provider.supportsManualConfirmation) throw AppError.notFound('Платёж');
    return this.repository.transaction(async (tx) => {
      const payment = await tx.lock({ id });
      if (!payment) throw AppError.notFound('Платёж');
      await this.settle(tx, payment, outcome === 'success' ? 'succeeded' : 'cancelled');
      return toView(payment);
    });
  }

  async handleWebhook(providerId: string, request: WebhookRequest): Promise<{ ignored: boolean }> {
    if (providerId !== this.provider.id) throw AppError.notFound('Платёжный провайдер');
    const result = await this.provider.parseWebhook(request).catch((error: Error) => {
      throw AppError.badRequest(`Некорректный webhook: ${error.message}`);
    });
    if (!result) return { ignored: true };
    // A shared provider account (Kaspi cashier of MyBooks and Project X) notifies about payments of other shops too.
    const known = await this.repository.findByExternalId(this.provider.id, result.externalId);
    if (!known) return { ignored: true };
    // When the provider can be asked directly, the notification only triggers the check.
    const outcome = this.provider.fetchOutcome ? await this.provider.fetchOutcome(result.externalId) : result.outcome;
    if (!outcome || outcome === 'pending') return { ignored: false };
    await this.settleExternal(result.externalId, outcome);
    return { ignored: false };
  }

  /**
   * Re-checks pending payments of the last day with the provider: covers a webhook that never arrived.
   * Returns how many payments changed status.
   */
  async reconcile(now = new Date()): Promise<number> {
    if (!this.provider.fetchOutcome) return 0;
    const pending = await this.repository.listPending(this.provider.id, new Date(now.getTime() - 24 * 3600_000));
    let changed = 0;
    for (const payment of pending) {
      if (!payment.externalId) continue;
      const outcome = await this.provider.fetchOutcome(payment.externalId).catch(() => 'pending' as const);
      if (outcome === 'pending') continue;
      if (await this.settleExternal(payment.externalId, outcome)) changed++;
    }
    return changed;
  }

  private settleExternal(externalId: string, outcome: PaymentOutcome): Promise<boolean> {
    return this.repository.transaction(async (tx) => {
      const payment = await tx.lock({ provider: this.provider.id, externalId });
      if (!payment || payment.status !== 'pending') return false;
      return this.settle(tx, payment, outcome);
    });
  }

  private async settle(tx: PaymentTransaction, payment: Payment, outcome: PaymentOutcome): Promise<boolean> {
    if (!settle(payment, outcome)) return false;
    await tx.update(payment);
    if (payment.status === 'succeeded') {
      await tx.enqueue(
        createEnvelope('payments.succeeded', {
          paymentId: payment.id,
          projectId: payment.projectId,
          kind: payment.kind,
          amount: payment.amount,
        }),
      );
    }
    return true;
  }
}

function toView(payment: Payment): PaymentView {
  return {
    id: payment.id,
    projectId: payment.projectId,
    kind: payment.kind,
    amount: payment.amount,
    description: payment.description,
    status: payment.status,
    provider: payment.provider,
    redirectUrl: payment.redirectUrl,
    returnUrl: payment.returnUrl,
    createdAt: payment.createdAt.toISOString(),
    paidAt: payment.paidAt?.toISOString() ?? null,
  };
}
