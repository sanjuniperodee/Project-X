import { z } from '@px/contracts';

/** Variables every service understands. */
export const BaseEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

/**
 * Parses process.env against a schema and fails fast with a readable message.
 * Each service declares exactly the variables it needs — nothing is read ad hoc.
 */
export function loadConfig<Shape extends z.ZodRawShape>(shape: Shape, env: NodeJS.ProcessEnv = process.env) {
  const schema = BaseEnv.extend(shape);
  const result = schema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data as z.infer<typeof schema>;
}

/** "true"/"1"/"yes" -> true. z.coerce.boolean() would treat "false" as true. */
export const envBoolean = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');
