import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { ErrorResponse } from '@px/contracts';
import { AppError } from './errors';

export interface ReadinessCheck {
  name: string;
  check: () => Promise<void>;
}

export interface ServiceOptions {
  name: string;
  logLevel?: string;
  /** Pretty logs for local development. */
  prettyLogs?: boolean;
  /** Request body limit in bytes. */
  bodyLimit?: number;
  /** Translates service-specific errors (e.g. domain rule violations) into AppErrors. */
  mapError?: (error: unknown) => AppError | undefined;
  fastify?: Omit<FastifyServerOptions, 'logger'>;
}

export interface Service {
  app: FastifyInstance;
  /** Registers a dependency that must be healthy for `/ready` to pass. */
  addReadinessCheck(check: ReadinessCheck): void;
  /** Registers cleanup executed on SIGTERM/SIGINT, in reverse order. */
  onShutdown(fn: () => Promise<void> | void): void;
  listen(options: { host: string; port: number }): Promise<void>;
}

/**
 * Creates a Fastify app with the conventions shared by every service:
 * request ids, structured logs, uniform error responses, health endpoints
 * and graceful shutdown.
 */
export function createService(options: ServiceOptions): Service {
  const app = Fastify({
    ...options.fastify,
    bodyLimit: options.bodyLimit ?? 1024 * 1024,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
    logger: {
      level: options.logLevel ?? 'info',
      base: { service: options.name },
      redact: ['req.headers.authorization', 'req.headers.cookie'],
      ...(options.prettyLogs ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
    },
  });

  const checks: ReadinessCheck[] = [];
  const cleanups: Array<() => Promise<void> | void> = [];

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.setErrorHandler((rawError, request, reply) => {
    const error = options.mapError?.(rawError) ?? rawError;
    if (error instanceof AppError) {
      const body: ErrorResponse = {
        error: { code: error.code, message: error.message, fields: error.fields, requestId: request.id },
      };
      return reply.status(error.status).send(body);
    }

    const fastifyError = error as { statusCode?: number; code?: string; message: string };
    if (fastifyError.statusCode && fastifyError.statusCode < 500) {
      const body: ErrorResponse = {
        error: { code: 'bad_request', message: fastifyError.message, requestId: request.id },
      };
      return reply.status(fastifyError.statusCode).send(body);
    }

    request.log.error({ err: error }, 'Unhandled error');
    const body: ErrorResponse = {
      error: { code: 'internal', message: 'Внутренняя ошибка. Мы уже разбираемся.', requestId: request.id },
    };
    return reply.status(500).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const body: ErrorResponse = {
      error: { code: 'not_found', message: `Маршрут ${request.method} ${request.url} не найден`, requestId: request.id },
    };
    return reply.status(404).send(body);
  });

  app.get('/health', { logLevel: 'silent' }, async () => ({ status: 'ok', service: options.name }));

  app.get('/ready', { logLevel: 'silent' }, async (_request, reply) => {
    const results = await Promise.all(
      checks.map(async ({ name, check }) => {
        try {
          await check();
          return { name, ok: true };
        } catch (error) {
          return { name, ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      }),
    );
    const ready = results.every((r) => r.ok);
    return reply.status(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready', checks: results });
  });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    try {
      await app.close();
      for (const cleanup of cleanups.reverse()) await cleanup();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'Shutdown failed');
      process.exit(1);
    }
  };

  return {
    app,
    addReadinessCheck: (check) => checks.push(check),
    onShutdown: (fn) => cleanups.push(fn),
    async listen({ host, port }) {
      process.once('SIGTERM', () => void shutdown('SIGTERM'));
      process.once('SIGINT', () => void shutdown('SIGINT'));
      await app.listen({ host, port });
    },
  };
}
