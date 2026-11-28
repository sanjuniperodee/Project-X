import { NatsEventBus } from '@px/service-kit';
import { ClaudeSeller } from './agent/claude-seller';
import { buildSalesApp } from './app';
import { config } from './config';
import { createDatabase, runMigrations } from './infrastructure/db/client';
import { HttpMediaReader } from './infrastructure/catalog-store';
import { DisabledWhatsApp, GowaWhatsApp } from './infrastructure/gowa';
import { WaCatalog } from './infrastructure/wa-catalog';
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
  waCatalog: whatsapp instanceof GowaWhatsApp ? new WaCatalog(whatsapp, config.WA_CATALOG_DOCS) : null,
  media: new HttpMediaReader(config.MEDIA_URL),
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

// Reminders to customers who went silent (working hours only; the ladder lives in domain/follow-ups).
const followUps = setInterval(() => void sales.followUps().catch((error: Error) => service.app.log.warn({ err: error }, 'follow-ups failed')), 60_000);
followUps.unref();
service.onShutdown(async () => clearInterval(followUps));
await service.listen({ host: config.HOST, port: config.PORT });
