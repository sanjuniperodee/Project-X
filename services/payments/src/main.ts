import { NatsEventBus } from '@px/service-kit';
import { buildPaymentsApp } from './app';
import { CashierService } from './application/cashier-service';
import { config, envKaspiSession } from './config';
import { createDatabase, runMigrations } from './infrastructure/db/client';
import { EncryptedSettingsStore } from './infrastructure/settings-store';
import { createProvider } from './providers';
import { KaspiCashier } from './providers/kaspi/kaspi-cashier';
import { KaspiPosClient } from './providers/kaspi/kaspi-pos-client';

const database = createDatabase(config.DATABASE_URL);
await runMigrations(database.db, config.MIGRATIONS_DIR);

// Kaspi: one kaspi-pos client; the session comes from the cashier connected in /admin (or the env fallback).
const kaspi = config.PAYMENT_PROVIDER === 'kaspi';
let cashier: CashierService | undefined;
const kaspiClient = new KaspiPosClient(config.KASPI_API_URL, { session: async () => (cashier ? cashier.session() : null) });
if (kaspi) {
  cashier = new CashierService(new EncryptedSettingsStore(database.db, config.SETTINGS_SECRET), new KaspiCashier(kaspiClient), envKaspiSession);
}

const { service, relay, payments } = await buildPaymentsApp({
  db: database.db,
  connectBus: (log) => NatsEventBus.connect({ url: config.NATS_URL, name: 'payments', log }),
  provider: createProvider(config.PAYMENT_PROVIDER, {
    frontendUrl: config.FRONTEND_URL,
    kaspi: { client: kaspiClient, webhookSecret: config.KASPI_WEBHOOK_SECRET },
  }),
  cashier,
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
