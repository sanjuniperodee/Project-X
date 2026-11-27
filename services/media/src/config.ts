import { z } from '@px/contracts';
import { loadConfig } from '@px/service-kit';

export const config = loadConfig({
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_DIR: z.string().default('./.data/uploads'),
  PUBLIC_PATH: z.string().startsWith('/').default('/api/media'),
  /** S3-compatible storage (STORAGE_DRIVER=s3). The bucket may be shared: keys live under S3_PREFIX. */
  S3_ENDPOINT: z.url().default('https://object.pscloud.io'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default(''),
  S3_PREFIX: z
    .string()
    .default('px/')
    .transform((p) => (p && !p.endsWith('/') ? `${p}/` : p)),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
});

if (config.STORAGE_DRIVER === 's3') {
  const missing = (['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const).filter((k) => !config[k]);
  if (missing.length) throw new Error(`STORAGE_DRIVER=s3 requires ${missing.join(', ')}`);
}
