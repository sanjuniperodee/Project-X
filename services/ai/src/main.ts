import { createService, NatsEventBus } from '@px/service-kit';
import { config } from './config';
import { startDraftWorker } from './draft-worker';
import { ClaudeDraftGenerator } from './generators/claude';
import type { DraftGenerator } from './generators/generator';
import { TemplateDraftGenerator } from './generators/template';
import { CatalogClient } from './infrastructure/catalog-client';

const service = createService({ name: 'ai', logLevel: config.LOG_LEVEL, prettyLogs: config.NODE_ENV === 'development' });
const log = service.app.log;

const generator: DraftGenerator =
  config.AI_GENERATOR === 'claude'
    ? new ClaudeDraftGenerator({ apiKey: config.ANTHROPIC_API_KEY!, model: config.AI_MODEL })
    : new TemplateDraftGenerator();

const bus = await NatsEventBus.connect({ url: config.NATS_URL, name: 'ai', log });
service.addReadinessCheck({ name: 'nats', check: () => bus.ping() });
service.onShutdown(() => bus.close());

await startDraftWorker({ bus, generator, catalog: new CatalogClient(config.CATALOG_URL), log });
log.info({ generator: generator.id }, 'Draft worker started');

await service.listen({ host: config.HOST, port: config.PORT });
