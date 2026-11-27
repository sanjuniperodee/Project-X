import { z } from '@px/contracts';
import { loadConfig } from '@px/service-kit';

export const config = loadConfig({
  DATABASE_URL: z.string().startsWith('postgres'),
  NATS_URL: z.string().startsWith('nats://'),
  CATALOG_URL: z.url(),
  PAYMENTS_URL: z.url(),
  FRONTEND_URL: z.url(),
  MIGRATIONS_DIR: z.string().default('./drizzle'),
});
export type ProjectsConfig = typeof config;
