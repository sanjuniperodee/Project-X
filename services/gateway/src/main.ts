import { buildGateway } from './app';
import { config } from './config';

const service = await buildGateway(config);
await service.listen({ host: config.HOST, port: config.PORT });
