import { timingSafeEqual } from 'node:crypto';
import cors from '@fastify/cors';
import proxy from '@fastify/http-proxy';
import rateLimit from '@fastify/rate-limit';
import { AppError, createService } from '@px/service-kit';
import type { GatewayConfig } from './config';
import { routeTable } from './routes';

export async function buildGateway(config: GatewayConfig) {
  const service = createService({
    name: 'gateway',
    logLevel: config.LOG_LEVEL,
    prettyLogs: config.NODE_ENV === 'development',
    // Uploads are streamed through to the media service.
    bodyLimit: 20 * 1024 * 1024,
    fastify: { trustProxy: config.TRUST_PROXY },
  });
  const { app } = service;

  await app.register(cors, {
    origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: false,
    exposedHeaders: ['x-request-id'],
  });

  await app.register(rateLimit, {
    max: config.RATE_LIMIT_PER_MINUTE,
    timeWindow: '1 minute',
    allowList: (request) => request.url === '/health' || request.url === '/ready',
  });

  const adminToken = Buffer.from(config.ADMIN_TOKEN);
  const isAdmin = (header: string | undefined) => {
    const token = Buffer.from(header?.replace(/^Bearer\s+/i, '') ?? '');
    return token.length === adminToken.length && timingSafeEqual(token, adminToken);
  };

  for (const route of routeTable(config)) {
    await app.register(proxy, {
      upstream: route.upstream,
      prefix: route.prefix,
      rewritePrefix: route.rewritePrefix,
      // Let multipart uploads stream through untouched.
      preHandler: route.admin
        ? async (request) => {
            if (!isAdmin(request.headers.authorization)) throw AppError.unauthorized();
          }
        : undefined,
      replyOptions: {
        rewriteRequestHeaders: (request, headers) => ({
          ...headers,
          'x-request-id': request.id,
          'x-forwarded-host': request.headers.host ?? '',
        }),
      },
    });
  }

  return service;
}
