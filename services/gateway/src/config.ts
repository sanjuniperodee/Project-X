import { z } from '@px/contracts';
import { loadConfig } from '@px/service-kit';

export const config = loadConfig({
  CATALOG_URL: z.url(),
  PROJECTS_URL: z.url(),
  PAYMENTS_URL: z.url(),
  MEDIA_URL: z.url(),
  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  /** Shared secret for studio back-office endpoints. */
  ADMIN_TOKEN: z.string().min(24, 'ADMIN_TOKEN must be at least 24 characters'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
});

export type GatewayConfig = typeof config;
