import { ProductId, z } from '@px/contracts';
import { loadConfig } from '@px/service-kit';

export const config = loadConfig({
  DATABASE_URL: z.string().startsWith('postgres'),
  NATS_URL: z.string().startsWith('nats://'),
  CATALOG_URL: z.url(),
  PROJECTS_URL: z.url(),
  FRONTEND_URL: z.url(),
  PRODUCT_URLS: z
    .string()
    .default('')
    .transform(
      (value) =>
        Object.fromEntries(
          value
            .split(',')
            .map((pair) => pair.trim())
            .filter(Boolean)
            .map((pair) => {
              const [product, url] = pair.split('=');
              return [ProductId.parse(product), z.url().parse(url)];
            }),
        ) as Partial<Record<ProductId, string>>,
    ),
  /** Studio WhatsApp through GOWA; empty URL turns WhatsApp off (nothing is sent). */
  GOWA_API_URL: z.string().default(''),
  GOWA_BASIC_AUTH: z.string().default(''),
  GOWA_CALLBACK_URL: z.string().default(''),
  GOWA_WEBHOOK_SECRET: z.string().default(''),
  /** AI seller. Empty key: chats go to the studio without bot replies. */
  ANTHROPIC_API_KEY: z.string().default(''),
  SALES_MODEL: z.string().default('claude-opus-5-5'),
  SALES_EFFORT: z.enum(['low', 'medium', 'high']).default('medium'),
  BOT_ENABLED: z.enum(['true', 'false']).default('true'),
  /** Studio owner's WhatsApp for hand-offs and payment alerts (digits, with country code). */
  STUDIO_PHONE: z
    .string()
    .default('')
    .transform((v) => v.replace(/\D/g, '') || null),
  MIGRATIONS_DIR: z.string().default('./drizzle'),
});

if (config.GOWA_API_URL && (!config.GOWA_WEBHOOK_SECRET || !config.GOWA_CALLBACK_URL)) {
  throw new Error('GOWA_API_URL requires GOWA_WEBHOOK_SECRET and GOWA_CALLBACK_URL');
}
