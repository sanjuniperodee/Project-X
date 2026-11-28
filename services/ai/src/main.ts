import { createService, NatsEventBus } from '@px/service-kit';
import { config } from './config';
import { startDraftWorker } from './draft-worker';
import { ClaudeDraftGenerator } from './generators/claude';
import type { DraftGenerator } from './generators/generator';
import { TemplateDraftGenerator } from './generators/template';
import { CatalogClient } from './infrastructure/catalog-client';

const service = createService({ name: 'ai', logLevel: config.LOG_LEVEL, prettyLogs: config.NODE_ENV === 'development' });
const log = service.app.log;

const bus = await NatsEventBus.connect({ url: config.NATS_URL, name: 'ai', log });

const generator: DraftGenerator =
  config.AI_GENERATOR === 'claude'
    ? new ClaudeDraftGenerator({
        apiKey: config.ANTHROPIC_API_KEY!,
        model: config.AI_MODEL,
        // Token spend goes to the sales service, which keeps the studio's AI spend summary.
        onUsage: (usage) => void bus.publish('ai.llm_used', usage).catch((error: Error) => log.warn({ err: error }, 'usage not reported')),
      })
    : new TemplateDraftGenerator();
service.addReadinessCheck({ name: 'nats', check: () => bus.ping() });
service.onShutdown(() => bus.close());

await startDraftWorker({ bus, generator, catalog: new CatalogClient(config.CATALOG_URL), log });
log.info({ generator: generator.id }, 'Draft worker started');

await service.listen({ host: config.HOST, port: config.PORT });
