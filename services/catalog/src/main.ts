import { buildCatalogService } from './app';
import { config } from './config';

const service = buildCatalogService();
await service.listen({ host: config.HOST, port: config.PORT });
