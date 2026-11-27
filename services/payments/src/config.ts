import { z } from '@px/contracts';
import { loadConfig } from '@px/service-kit';
import { PAYMENT_PROVIDERS } from './providers';

export const config = loadConfig({
  DATABASE_URL: z.string().startsWith('postgres'),
  NATS_URL: z.string().startsWith('nats://'),
  PAYMENT_PROVIDER: z.enum(PAYMENT_PROVIDERS).default('mock'),
  FRONTEND_URL: z.url(),
  MIGRATIONS_DIR: z.string().default('./drizzle'),
  /** kaspi-pos-automation sidecar and the cashier session it issued (PAYMENT_PROVIDER=kaspi). */
  KASPI_API_URL: z.url().default('http://127.0.0.1:3032'),
  KASPI_TOKEN_SN: z.string().default(''),
  KASPI_VTOKEN_SECRET: z.string().default(''),
  KASPI_PROFILE_ID: z.coerce.number().int().nonnegative().default(0),
  /** Secret of this service's entry in kaspi-pos webhooks.json (HMAC of X-Webhook-Signature). */
  KASPI_WEBHOOK_SECRET: z.string().default(''),
  /** How often pending payments are re-checked with the provider, in case a webhook was lost. 0 disables. */
  RECONCILE_INTERVAL_SECONDS: z.coerce.number().int().nonnegative().default(30),
});

if (config.PAYMENT_PROVIDER === 'kaspi') {
  const missing = (['KASPI_TOKEN_SN', 'KASPI_VTOKEN_SECRET', 'KASPI_WEBHOOK_SECRET'] as const).filter((k) => !config[k]);
  if (missing.length) throw new Error(`PAYMENT_PROVIDER=kaspi requires ${missing.join(', ')}`);
}

export const kaspiOptions = {
  apiUrl: config.KASPI_API_URL,
  tokenSn: config.KASPI_TOKEN_SN,
  vtokenSecret: config.KASPI_VTOKEN_SECRET,
  profileId: config.KASPI_PROFILE_ID,
  webhookSecret: config.KASPI_WEBHOOK_SECRET,
};
