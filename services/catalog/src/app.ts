import { createService } from '@px/service-kit';
import { config } from './config';
import { registerRoutes } from './http/routes';
import { ProductRegistry } from './products';

export function buildCatalogService() {
  const service = createService({
    name: 'catalog',
    logLevel: config.LOG_LEVEL,
    prettyLogs: config.NODE_ENV === 'development',
  });
  registerRoutes(service.app, new ProductRegistry());
  return service;
}
