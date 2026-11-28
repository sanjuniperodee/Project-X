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
  /** Automatic layout revision rounds before the project goes to a designer in the studio. */
  /** Layout service (private network): page previews before the submit. */
  LAYOUT_URL: z.url().default('http://127.0.0.1:4107'),
  LAYOUT_REVISION_LIMIT: z.coerce.number().int().min(0).max(10).default(3),
});
export type ProjectsConfig = typeof config;
