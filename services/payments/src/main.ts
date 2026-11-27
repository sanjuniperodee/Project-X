import { NatsEventBus } from '@px/service-kit';
import { buildPaymentsApp } from './app';
import { config } from './config';
import { createDatabase, runMigrations } from './infrastructure/db/client';
import { createProvider } from './providers';

const database = createDatabase(config.DATABASE_URL);
await runMigrations(database.db, config.MIGRATIONS_DIR);

const { service, relay } = await buildPaymentsApp({
  db: database.db,
  connectBus: (log) => NatsEventBus.connect({ url: config.NATS_URL, name: 'payments', log }),
  provider: createProvider(config.PAYMENT_PROVIDER, { frontendUrl: config.FRONTEND_URL }),
  logLevel: config.LOG_LEVEL,
  prettyLogs: config.NODE_ENV === 'development',
});

service.addReadinessCheck({ name: 'postgres', check: database.ping });
service.onShutdown(() => database.close());
service.onShutdown(() => relay.stop());

relay.start();
await service.listen({ host: config.HOST, port: config.PORT });
