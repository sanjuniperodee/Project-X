import { z } from '@px/contracts';
import { loadConfig } from '@px/service-kit';

export const config = loadConfig({
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  STORAGE_DIR: z.string().default('./.data/uploads'),
  PUBLIC_PATH: z.string().startsWith('/').default('/api/media'),
});
