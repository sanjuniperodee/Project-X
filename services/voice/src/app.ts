import { createService } from '@px/service-kit';
import type { CatalogGateway, ProjectsGateway, VoiceProvider } from './application/ports';
import { VoiceService } from './application/voice-service';
import { registerRoutes } from './http/routes';

export interface VoiceAppDeps {
  projects: ProjectsGateway;
  catalog: CatalogGateway;
  provider?: VoiceProvider;
  logLevel?: string;
  prettyLogs?: boolean;
}

/** Composition root: used by main.ts and by tests. */
export function buildVoiceApp(deps: VoiceAppDeps) {
  const service = createService({ name: 'voice', logLevel: deps.logLevel, prettyLogs: deps.prettyLogs });
  const voice = new VoiceService({ projects: deps.projects, catalog: deps.catalog, provider: deps.provider, log: service.app.log });
  registerRoutes(service.app, voice);
  return { service, voice };
}
