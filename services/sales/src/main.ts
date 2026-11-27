import { NatsEventBus } from '@px/service-kit';
import { ClaudeSeller } from './agent/claude-seller';
import { buildSalesApp } from './app';
import { config } from './config';
import { createDatabase, runMigrations } from './infrastructure/db/client';
import { DisabledWhatsApp, GowaWhatsApp } from './infrastructure/gowa';
import { HttpCatalogGateway, HttpProjectsGateway } from './infrastructure/services';

const database = createDatabase(config.DATABASE_URL);
await runMigrations(database.db, config.MIGRATIONS_DIR);

const whatsapp = config.GOWA_API_URL
  ? new GowaWhatsApp({
      baseUrl: config.GOWA_API_URL,
      basicAuth: config.GOWA_BASIC_AUTH,
      webhookUrl: config.GOWA_CALLBACK_URL,
      webhookSecret: config.GOWA_WEBHOOK_SECRET,
    })
  : new DisabledWhatsApp();

const { service, sales } = await buildSalesApp({
  db: database.db,
  connectBus: (log) => NatsEventBus.connect({ url: config.NATS_URL, name: 'sales', log }),
  whatsapp,
  catalog: new HttpCatalogGateway(config.CATALOG_URL),
  projects: new HttpProjectsGateway(config.PROJECTS_URL),
  agent: (log) =>
    config.ANTHROPIC_API_KEY && config.BOT_ENABLED === 'true'
      ? new ClaudeSeller({ apiKey: config.ANTHROPIC_API_KEY, model: config.SALES_MODEL, effort: config.SALES_EFFORT, log })
      : null,
  frontendUrl: config.FRONTEND_URL,
  productUrls: config.PRODUCT_URLS,
  studioPhone: config.STUDIO_PHONE,
  webhookSecret: config.GOWA_WEBHOOK_SECRET,
  logLevel: config.LOG_LEVEL,
  prettyLogs: config.NODE_ENV === 'development',
});

service.addReadinessCheck({ name: 'postgres', check: database.ping });
service.onShutdown(() => database.close());

// Keep the studio device's webhook pointed here (harmless when it already is); answer chats left waiting.
if (whatsapp.enabled) await whatsapp.connect().catch((error: Error) => service.app.log.warn({ err: error }, 'whatsapp connect failed'));
await sales.resumePending();
await service.listen({ host: config.HOST, port: config.PORT });
