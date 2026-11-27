import { ProductId, z } from '@px/contracts';
import { loadConfig } from '@px/service-kit';

export const config = loadConfig({
  DATABASE_URL: z.string().startsWith('postgres'),
  NATS_URL: z.string().startsWith('nats://'),
  CATALOG_URL: z.url(),
  PAYMENTS_URL: z.url(),
  FRONTEND_URL: z.url(),
  /**
   * Optional brand domains, e.g. "glossy=https://coverme.kz,shezhire=https://shezhire.kz".
   * Customers then return to the brand's own site after paying; otherwise to FRONTEND_URL/<product>.
   */
  PRODUCT_URLS: z
    .string()
    .default('')
    .transform((value) =>
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
  MIGRATIONS_DIR: z.string().default('./drizzle'),
});
export type ProjectsConfig = typeof config;
