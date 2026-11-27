import { createService, type EventBus, type Logger } from '@px/service-kit';
import { LayoutService } from './application/layout-service';
import type { CatalogGateway, MediaGateway, ProjectsGateway } from './application/ports';
import { subscribeToEvents } from './events/subscriptions';
import { registerRoutes } from './http/routes';
import { createRenderer, imageProcessor } from './infrastructure/adapters';
import { FontLibrary } from './infrastructure/fonts';

export interface LayoutAppDeps {
  connectBus: (log: Logger) => Promise<EventBus>;
  projects: ProjectsGateway;
  catalog: CatalogGateway;
  media: MediaGateway;
  tmpDir: string;
  thumbnailSize?: number;
  fontsDir?: string;
  logLevel?: string;
  prettyLogs?: boolean;
}

/** Composition root: used by main.ts and by tests. */
export async function buildLayoutApp(deps: LayoutAppDeps) {
  const service = createService({ name: 'layout', logLevel: deps.logLevel, prettyLogs: deps.prettyLogs, bodyLimit: 5 * 1024 * 1024 });
  const bus = await deps.connectBus(service.app.log);
  service.onShutdown(() => bus.close());
  service.addReadinessCheck({ name: 'nats', check: () => bus.ping() });

  const fonts = new FontLibrary(deps.fontsDir);
  const layouts = new LayoutService({
    projects: deps.projects,
    catalog: deps.catalog,
    media: deps.media,
    images: imageProcessor,
    renderer: createRenderer(fonts),
    fonts,
    bus,
    log: service.app.log,
    tmpDir: deps.tmpDir,
    thumbnailSize: deps.thumbnailSize ?? 640,
  });

  registerRoutes(service.app, layouts, deps.catalog);
  await subscribeToEvents(bus, layouts);
  return { service, layouts, bus };
}
