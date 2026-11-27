import { z } from '@px/contracts';
import { loadConfig } from '@px/service-kit';

export const config = loadConfig({
  NATS_URL: z.string().startsWith('nats://'),
  CATALOG_URL: z.url(),
  AI_GENERATOR: z.enum(['template', 'claude']).default('template'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-opus-5-5'),
});

if (config.AI_GENERATOR === 'claude' && !config.ANTHROPIC_API_KEY) {
  throw new Error('AI_GENERATOR=claude requires ANTHROPIC_API_KEY');
}
