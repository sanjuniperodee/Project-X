import type { z } from '@px/contracts';
import { AppError } from './errors';

/**
 * Validates untrusted input (body, params, query) against a contract schema.
 * Throws a 422 AppError with per-field messages.
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.') || '_';
    fields[path] ??= issue.message;
  }
  throw AppError.validation(fields);
}
