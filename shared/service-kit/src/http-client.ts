import { ErrorResponse, type z } from '@px/contracts';
import { AppError } from './errors';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Typed client for synchronous service-to-service calls.
 * Responses are validated against the contract schema, so a breaking change
 * in another service fails loudly at the boundary instead of deep inside logic.
 */
export class ServiceClient {
  constructor(
    private readonly serviceName: string,
    private readonly baseUrl: string,
    private readonly defaults: { headers?: Record<string, string>; timeoutMs?: number } = {},
  ) {}

  async request<S extends z.ZodType>(path: string, schema: S, options: RequestOptions = {}): Promise<z.infer<S>> {
    const url = new URL(path, this.baseUrl);
    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: {
          accept: 'application/json',
          ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...this.defaults.headers,
          ...options.headers,
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(options.timeoutMs ?? this.defaults.timeoutMs ?? 5_000),
      });
    } catch (error) {
      throw AppError.unavailable(`Сервис ${this.serviceName} недоступен: ${(error as Error).message}`);
    }

    const payload: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);

    if (!response.ok) {
      const parsed = ErrorResponse.safeParse(payload);
      if (parsed.success && response.status < 500) {
        const { code, message, fields } = parsed.data.error;
        throw new AppError(code, message, fields);
      }
      throw AppError.unavailable(`Сервис ${this.serviceName} ответил ${response.status}`);
    }

    const result = schema.safeParse(payload);
    if (!result.success) {
      throw new Error(`Contract violation from ${this.serviceName} ${path}: ${result.error.message}`);
    }
    return result.data;
  }
}
