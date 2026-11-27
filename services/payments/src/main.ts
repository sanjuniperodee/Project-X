import { NatsEventBus } from '@px/service-kit';
import { buildPaymentsApp } from './app';
import { config, kaspiOptions } from './config';
import { createDatabase, runMigrations } from './infrastructure/db/client';
import { createProvider } from './providers';

const database = createDatabase(config.DATABASE_URL);
await runMigrations(database.db, config.MIGRATIONS_DIR);

const { service, relay, payments } = await buildPaymentsApp({
  db: database.db,
  connectBus: (log) => NatsEventBus.connect({ url: config.NATS_URL, name: 'payments', log }),
  provider: createProvider(config.PAYMENT_PROVIDER, { frontendUrl: config.FRONTEND_URL, kaspi: kaspiOptions }),
  logLevel: config.LOG_LEVEL,
  prettyLogs: config.NODE_ENV === 'development',
});

service.addReadinessCheck({ name: 'postgres', check: database.ping });
service.onShutdown(() => database.close());
service.onShutdown(() => relay.stop());

relay.start();

// Safety net for lost provider notifications: re-check pending payments now and then.
if (config.RECONCILE_INTERVAL_SECONDS > 0) {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    payments
      .reconcile()
      .then((changed) => changed && service.app.log.info({ changed }, 'payments reconciled'))
      .catch((error: Error) => service.app.log.warn({ err: error }, 'payments reconcile failed'))
      .finally(() => (running = false));
  }, config.RECONCILE_INTERVAL_SECONDS * 1000);
  timer.unref();
  service.onShutdown(async () => clearInterval(timer));
}
await service.listen({ host: config.HOST, port: config.PORT });
