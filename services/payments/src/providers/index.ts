import { MockPaymentProvider } from './mock-provider';
import type { PaymentProvider } from './provider';

export const PAYMENT_PROVIDERS = ['mock'] as const;
export type PaymentProviderId = (typeof PAYMENT_PROVIDERS)[number];

export function createProvider(id: PaymentProviderId, options: { frontendUrl: string }): PaymentProvider {
  switch (id) {
    case 'mock':
      return new MockPaymentProvider(options.frontendUrl);
  }
}

export type { PaymentProvider } from './provider';
