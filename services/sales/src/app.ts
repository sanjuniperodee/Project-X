import type { ProductId } from '@px/contracts';
import { createService, type EventBus, type Logger } from '@px/service-kit';
import { CatalogService } from './application/catalog-service';
import type { CatalogGateway, CatalogGatewayWa, MediaReader, ProjectsGateway, SellerAgent, WhatsAppGateway } from './application/ports';
import { SalesService } from './application/sales-service';
import { Links } from './domain/links';
import { subscribeToEvents } from './events/subscriptions';
import { registerRoutes } from './http/routes';
import { DrizzleCatalogStore } from './infrastructure/catalog-store';
import { DrizzleConversationRepository } from './infrastructure/conversation-repository';
import type { Database } from './infrastructure/db/client';

export interface SalesAppDeps {
  db: Database;
  connectBus: (log: Logger) => Promise<EventBus>;
  whatsapp: WhatsAppGateway;
  /** WhatsApp Business catalog (GOWA build with the catalog patch); null — no catalog. */
  waCatalog: CatalogGatewayWa | null;
  media: MediaReader;
  catalog: CatalogGateway;
  projects: ProjectsGateway;
  /** Built with the service logger; null when the AI seller is off. */
  agent: (log: Logger) => SellerAgent | null;
  frontendUrl: string;
  productUrls?: Partial<Record<ProductId, string>>;
  studioPhone: string | null;
  webhookSecret: string;
  logLevel?: string;
  prettyLogs?: boolean;
}

/** Composition root: wires adapters to use cases. Used by main.ts and by integration tests. */
export async function buildSalesApp(deps: SalesAppDeps) {
  const service = createService({ name: 'sales', logLevel: deps.logLevel, prettyLogs: deps.prettyLogs });
  const log = service.app.log as unknown as Logger;
  const links = new Links(deps.frontendUrl, deps.productUrls ?? {});

  const catalogService = new CatalogService({
    store: new DrizzleCatalogStore(deps.db),
    wa: deps.waCatalog,
    whatsapp: deps.whatsapp,
    catalog: deps.catalog,
    media: deps.media,
    links,
    log,
  });
  const sales = new SalesService({
    repository: new DrizzleConversationRepository(deps.db),
    whatsapp: deps.whatsapp,
    catalog: deps.catalog,
    projects: deps.projects,
    agent: deps.agent(log),
    waCatalog: deps.waCatalog ? { service: catalogService, wa: deps.waCatalog } : null,
    links,
    studioPhone: deps.studioPhone,
    log,
  });
  registerRoutes(service.app, sales, catalogService, { webhookSecret: deps.webhookSecret });

  const bus = await deps.connectBus(log);
  service.onShutdown(() => bus.close());
  service.addReadinessCheck({ name: 'nats', check: () => bus.ping() });
  await subscribeToEvents(bus, sales);

  return { service, sales, catalog: catalogService };
}
