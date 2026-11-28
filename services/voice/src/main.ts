import { buildVoiceApp } from './app';
import { config } from './config';
import { HttpCatalogGateway, HttpProjectsGateway } from './infrastructure/clients';
import { ElevenLabsClient } from './infrastructure/elevenlabs';

const { service } = buildVoiceApp({
  projects: new HttpProjectsGateway(config.PROJECTS_URL),
  catalog: new HttpCatalogGateway(config.CATALOG_URL),
  provider:
    config.VOICE_PROVIDER === 'elevenlabs'
      ? new ElevenLabsClient({
          apiKey: config.ELEVENLABS_API_KEY!,
          agentId: config.ELEVENLABS_AGENT_ID!,
          baseUrl: config.ELEVENLABS_API_URL,
          transport: config.VOICE_TRANSPORT,
        })
      : undefined,
  logLevel: config.LOG_LEVEL,
  prettyLogs: config.NODE_ENV === 'development',
});
service.app.log.info({ provider: config.VOICE_PROVIDER }, 'Voice service ready');

await service.listen({ host: config.HOST, port: config.PORT });
