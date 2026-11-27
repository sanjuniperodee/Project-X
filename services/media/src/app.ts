import multipart from '@fastify/multipart';
import { MAX_UPLOAD_BYTES } from '@px/contracts';
import { createService } from '@px/service-kit';
import { registerInternalRoutes, registerRoutes } from './http/routes';
import type { Storage } from './storage/storage';

export interface MediaAppDeps {
  storage: Storage;
  publicPath: string;
  logLevel?: string;
  prettyLogs?: boolean;
}

export async function buildMediaApp(deps: MediaAppDeps) {
  const service = createService({ name: 'media', logLevel: deps.logLevel, prettyLogs: deps.prettyLogs });
  await service.app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 } });
  registerRoutes(service.app, deps.storage, deps.publicPath);
  registerInternalRoutes(service.app, deps.storage, deps.publicPath);
  service.addReadinessCheck({ name: 'storage', check: () => deps.storage.ping() });
  return service;
}
