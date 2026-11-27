import 'server-only';
import { z } from '@px/contracts';

/**
 * Server-side configuration. Parsed once, fails fast with a readable message.
 * Nothing here is ever sent to the browser.
 */
const Env = z.object({
  API_URL: z.url().default('http://localhost:8080'),
  ADMIN_TOKEN: z.string().min(1).optional(),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid frontend environment:\n${details}`);
}

export const env = parsed.data;
