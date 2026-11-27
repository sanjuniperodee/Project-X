import { randomUUID } from 'node:crypto';
import type { CreatePaymentRequest, PaymentView } from '@px/contracts';
import { AppError, createEnvelope } from '@px/service-kit';
import { settle, type Payment } from '../domain/payment';
import type { PaymentProvider } from '../providers';
import type { WebhookRequest } from '../providers/provider';
import type { PaymentRepository, PaymentTransaction } from './ports';

export class PaymentService {
  constructor(
    private readonly repository: PaymentRepository,
    private readonly provider: PaymentProvider,
  ) {}

  /** Internal: called by the projects service, which computes the amount. */
  async create(request: CreatePaymentRequest): Promise<PaymentView> {
    const payment: Payment = {
      id: randomUUID(),
      ...request,
      status: 'pending',
      provider: this.provider.id,
      externalId: null,
      redirectUrl: '',
      createdAt: new Date(),
      paidAt: null,
    };
    const session = await this.provider.createCheckout(payment);
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

  async handleWebhook(providerId: string, request: WebhookRequest): Promise<void> {
    if (providerId !== this.provider.id) throw AppError.notFound('Платёжный провайдер');
    const result = await this.provider.parseWebhook(request).catch((error: Error) => {
      throw AppError.badRequest(`Некорректный webhook: ${error.message}`);
    });
    await this.repository.transaction(async (tx) => {
      const payment = await tx.lock({ provider: this.provider.id, externalId: result.externalId });
      if (!payment) throw AppError.notFound('Платёж');
      await this.settle(tx, payment, result.outcome);
    });
  }

  private async settle(tx: PaymentTransaction, payment: Payment, outcome: 'succeeded' | 'failed' | 'cancelled') {
    if (!settle(payment, outcome)) return;
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
