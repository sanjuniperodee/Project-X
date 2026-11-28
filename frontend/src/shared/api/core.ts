import { ErrorResponse, type ErrorCode, type z } from '@px/contracts';

/** A failed API call with the gateway's uniform error body. */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'network',
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }

  get isNotFound() {
    return this.status === 404;
  }
}

export interface ApiRequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  cache?: RequestCache;
}

/**
 * Performs a request and validates the response against a contract schema.
 * Used by both the server client (absolute gateway URL) and the browser client (same origin).
 */
export async function request<S extends z.ZodType>(
  url: string,
  schema: S,
  init: ApiRequestInit = {},
): Promise<z.infer<S>> {
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(init.body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
      signal: init.signal,
      cache: init.cache ?? 'no-store',
    });
  } catch {
    throw new ApiError(0, 'network', 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
  }

  const payload: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = ErrorResponse.safeParse(payload);
    if (parsed.success) {
      const { code, message, fields } = parsed.data.error;
      throw new ApiError(response.status, code, message, fields);
    }
    throw new ApiError(response.status, 'internal', 'Сервер временно недоступен. Попробуйте через минуту.');
  }

  return schema.parse(payload);
}
