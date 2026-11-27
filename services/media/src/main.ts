import { buildMediaApp } from './app';
import { config } from './config';
import { LocalDiskStorage } from './storage/local-disk';
import { S3Storage } from './storage/s3';
import type { Storage } from './storage/storage';

const storage: Storage =
  config.STORAGE_DRIVER === 's3'
    ? new S3Storage({
        endpoint: config.S3_ENDPOINT,
        region: config.S3_REGION,
        bucket: config.S3_BUCKET,
        prefix: config.S3_PREFIX,
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      })
    : new LocalDiskStorage(config.STORAGE_DIR);

const service = await buildMediaApp({
  storage,
  publicPath: config.PUBLIC_PATH,
  logLevel: config.LOG_LEVEL,
  prettyLogs: config.NODE_ENV === 'development',
});
await service.listen({ host: config.HOST, port: config.PORT });
