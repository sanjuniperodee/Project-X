import { createService, type EventBus, type Logger } from '@px/service-kit';
import type { CatalogGateway, ProjectsGateway, SellerAgent, WhatsAppGateway } from './application/ports';
import { SalesService } from './application/sales-service';
import { Links } from './domain/links';
import { subscribeToEvents } from './events/subscriptions';
import { registerRoutes } from './http/routes';
import { DrizzleConversationRepository } from './infrastructure/conversation-repository';
import type { Database } from './infrastructure/db/client';
import type { ProductId } from '@px/contracts';

export interface SalesAppDeps {
  db: Database;
  connectBus: (log: Logger) => Promise<EventBus>;
  whatsapp: WhatsAppGateway;
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

  const sales = new SalesService({
    repository: new DrizzleConversationRepository(deps.db),
    whatsapp: deps.whatsapp,
    catalog: deps.catalog,
    projects: deps.projects,
    agent: deps.agent(log),
    links: new Links(deps.frontendUrl, deps.productUrls ?? {}),
    studioPhone: deps.studioPhone,
    log,
  });
  registerRoutes(service.app, sales, { webhookSecret: deps.webhookSecret });

  const bus = await deps.connectBus(log);
  service.onShutdown(() => bus.close());
  service.addReadinessCheck({ name: 'nats', check: () => bus.ping() });
  await subscribeToEvents(bus, sales);

  return { service, sales };
}
