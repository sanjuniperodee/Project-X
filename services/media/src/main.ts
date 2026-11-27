import { buildMediaApp } from './app';
import { config } from './config';
import { LocalDiskStorage } from './storage/local-disk';

const service = await buildMediaApp({
  storage: new LocalDiskStorage(config.STORAGE_DIR),
  publicPath: config.PUBLIC_PATH,
  logLevel: config.LOG_LEVEL,
  prettyLogs: config.NODE_ENV === 'development',
});
await service.listen({ host: config.HOST, port: config.PORT });
