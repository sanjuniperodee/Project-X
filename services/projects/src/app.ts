import type { ProductId } from '@px/contracts';
import { AppError, createService, OutboxRelay, type EventBus, type Logger } from '@px/service-kit';
import { ProjectService } from './application/project-service';
import type { CatalogGateway, PaymentsGateway } from './application/ports';
import { ProjectRuleViolation } from './domain/project';
import { subscribeToEvents } from './events/subscriptions';
import { registerAdminRoutes, registerInternalRoutes, registerInviteRoutes, registerOwnerRoutes } from './http/routes';
import type { Database } from './infrastructure/db/client';
import { DrizzleOutboxStore, DrizzleProjectRepository } from './infrastructure/project-repository';

export interface ProjectsAppDeps {
  db: Database;
  /** Connects the event bus; receives the service logger. */
  connectBus: (log: Logger) => Promise<EventBus>;
  catalog: CatalogGateway;
  payments: PaymentsGateway;
  frontendUrl: string;
  /** Automatic layout revision rounds before a designer takes over (default 3). */
  layoutRevisionLimit?: number;
  /** Brand sites by product; falls back to `${frontendUrl}/${productId}`. */
  productUrls?: Partial<Record<ProductId, string>>;
  logLevel?: string;
  prettyLogs?: boolean;
}

/** Composition root: wires adapters to use cases. Used by main.ts and by integration tests. */
export async function buildProjectsApp(deps: ProjectsAppDeps) {
  const service = createService({
    name: 'projects',
    logLevel: deps.logLevel,
    prettyLogs: deps.prettyLogs,
    mapError: (error) =>
      error instanceof ProjectRuleViolation ? AppError.conflict(error.message) : undefined,
  });

  const projects = new ProjectService({
    repository: new DrizzleProjectRepository(deps.db),
    catalog: deps.catalog,
    payments: deps.payments,
    revisionsLimit: deps.layoutRevisionLimit ?? 3,
    workspaceUrl: ({ productId, editKey }) => {
      const base = deps.productUrls?.[productId] ?? new URL(`/${productId}`, deps.frontendUrl).toString();
      return `${base.replace(/\/$/, '')}/p/${editKey}`;
    },
  });

  const bus = await deps.connectBus(service.app.log);
  service.onShutdown(() => bus.close());
  service.addReadinessCheck({ name: 'nats', check: () => bus.ping() });

  registerOwnerRoutes(service.app, projects);
  registerInviteRoutes(service.app, projects);
  registerAdminRoutes(service.app, projects);
  registerInternalRoutes(service.app, projects);
  await subscribeToEvents(bus, projects);

  const relay = new OutboxRelay({ store: new DrizzleOutboxStore(deps.db), bus, log: service.app.log });

  return { service, projects, relay };
}
