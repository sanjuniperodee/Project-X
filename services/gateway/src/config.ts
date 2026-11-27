import { z } from '@px/contracts';
import { envBoolean, loadConfig } from '@px/service-kit';

export const config = loadConfig({
  CATALOG_URL: z.url(),
  PROJECTS_URL: z.url(),
  PAYMENTS_URL: z.url(),
  MEDIA_URL: z.url(),
  /** Sales service (AI seller, WhatsApp). Only studio routes go there. */
  SALES_URL: z.url().default('http://127.0.0.1:4106'),
  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  /** Shared secret for studio back-office endpoints. */
  ADMIN_TOKEN: z.string().min(24, 'ADMIN_TOKEN must be at least 24 characters'),
  /** Trust X-Forwarded-For from the frontend proxy / load balancer in front of the gateway. */
  TRUST_PROXY: envBoolean.default(false),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
});

export type GatewayConfig = typeof config;
