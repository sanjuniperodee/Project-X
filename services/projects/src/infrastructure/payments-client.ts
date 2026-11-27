import { PaymentView, type CreatePaymentRequest } from '@px/contracts';
import { ServiceClient } from '@px/service-kit';
import type { PaymentsGateway } from '../application/ports';

export class HttpPaymentsGateway implements PaymentsGateway {
  private readonly client: ServiceClient;

  constructor(baseUrl: string) {
    this.client = new ServiceClient('payments', baseUrl, { timeoutMs: 10_000 });
  }

  createPayment(request: CreatePaymentRequest): Promise<PaymentView> {
    return this.client.request('/internal/payments', PaymentView, { method: 'POST', body: request });
  }
}
