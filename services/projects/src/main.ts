import { NatsEventBus } from '@px/service-kit';
import { buildProjectsApp } from './app';
import { config } from './config';
import { HttpCatalogGateway } from './infrastructure/catalog-client';
import { createDatabase, runMigrations } from './infrastructure/db/client';
import { HttpPaymentsGateway } from './infrastructure/payments-client';

const database = createDatabase(config.DATABASE_URL);
await runMigrations(database.db, config.MIGRATIONS_DIR);

const { service, relay } = await buildProjectsApp({
  db: database.db,
  connectBus: (log) => NatsEventBus.connect({ url: config.NATS_URL, name: 'projects', log }),
  catalog: new HttpCatalogGateway(config.CATALOG_URL),
  payments: new HttpPaymentsGateway(config.PAYMENTS_URL),
  frontendUrl: config.FRONTEND_URL,
  productUrls: config.PRODUCT_URLS,
  layoutRevisionLimit: config.LAYOUT_REVISION_LIMIT,
  logLevel: config.LOG_LEVEL,
  prettyLogs: config.NODE_ENV === 'development',
});

service.addReadinessCheck({ name: 'postgres', check: database.ping });
service.onShutdown(() => database.close());
service.onShutdown(() => relay.stop());

relay.start();
await service.listen({ host: config.HOST, port: config.PORT });
