import { NatsEventBus } from '@px/service-kit';
import { buildLayoutApp } from './app';
import { config } from './config';
import { HttpCatalogGateway, HttpMediaGateway, HttpProjectsGateway } from './infrastructure/clients';

const { service } = await buildLayoutApp({
  connectBus: (log) => NatsEventBus.connect({ url: config.NATS_URL, name: 'layout', log }),
  projects: new HttpProjectsGateway(config.PROJECTS_URL),
  catalog: new HttpCatalogGateway(config.CATALOG_URL),
  media: new HttpMediaGateway(config.MEDIA_URL),
  tmpDir: config.LAYOUT_TMP_DIR,
  thumbnailSize: config.PREVIEW_THUMBNAIL_SIZE,
  fontsDir: config.FONTS_DIR,
  logLevel: config.LOG_LEVEL,
  prettyLogs: config.NODE_ENV === 'development',
});

await service.listen({ host: config.HOST, port: config.PORT });
