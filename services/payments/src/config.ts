import { z } from '@px/contracts';
import { loadConfig } from '@px/service-kit';
import { PAYMENT_PROVIDERS } from './providers';

export const config = loadConfig({
  DATABASE_URL: z.string().startsWith('postgres'),
  NATS_URL: z.string().startsWith('nats://'),
  PAYMENT_PROVIDER: z.enum(PAYMENT_PROVIDERS).default('mock'),
  FRONTEND_URL: z.url(),
  MIGRATIONS_DIR: z.string().default('./drizzle'),
});
