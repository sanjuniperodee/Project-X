import { KaspiPaymentProvider, type KaspiOptions } from './kaspi/kaspi-provider';
import { MockPaymentProvider } from './mock-provider';
import type { PaymentProvider } from './provider';

export const PAYMENT_PROVIDERS = ['mock', 'kaspi'] as const;
export type PaymentProviderId = (typeof PAYMENT_PROVIDERS)[number];

export interface ProviderOptions {
  frontendUrl: string;
  kaspi?: Omit<KaspiOptions, 'frontendUrl'>;
}

export function createProvider(id: PaymentProviderId, options: ProviderOptions): PaymentProvider {
  switch (id) {
    case 'mock':
      return new MockPaymentProvider(options.frontendUrl);
    case 'kaspi':
      if (!options.kaspi) throw new Error('PAYMENT_PROVIDER=kaspi needs the KASPI_* settings');
      return new KaspiPaymentProvider({ ...options.kaspi, frontendUrl: options.frontendUrl });
  }
}

export type { PaymentProvider } from './provider';
