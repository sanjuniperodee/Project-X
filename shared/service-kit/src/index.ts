export { createService, type Service, type ServiceOptions, type ReadinessCheck } from './server';
export { loadConfig, BaseEnv, envBoolean } from './config';
export { AppError } from './errors';
export { parseInput } from './validation';
export { NatsEventBus, createEnvelope, type EventBus, type EventHandler, type SubscribeOptions, type Logger } from './events';
export { OutboxRelay, type OutboxStore, type OutboxRelayOptions } from './outbox';
export { ServiceClient, type RequestOptions } from './http-client';

// Re-exported so services never depend on their own copy of fastify.
export type { FastifyInstance, FastifyReply, FastifyRequest, FastifyPluginAsync } from 'fastify';
