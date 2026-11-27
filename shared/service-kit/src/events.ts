import { randomUUID } from 'node:crypto';
import {
  AckPolicy,
  connect,
  DeliverPolicy,
  JSONCodec,
  RetentionPolicy,
  StorageType,
  type ConsumerMessages,
  type JetStreamClient,
  type JetStreamManager,
  type NatsConnection,
} from 'nats';
import { parseEventPayload, type EventEnvelope, type EventPayload, type EventType } from '@px/contracts';

const STREAM = 'PX_EVENTS';
const SUBJECT_PREFIX = 'px.';
const codec = JSONCodec<EventEnvelope>();

export interface Logger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export type EventHandler<T extends EventType> = (event: EventEnvelope<T>) => Promise<void>;

export interface SubscribeOptions {
  /**
   * Durable consumer name. Must be unique per (service, event type):
   * JetStream remembers its position, so events published while the
   * service was down are delivered after restart.
   */
  durable: string;
  /** Redelivery attempts before the event is dropped and logged. */
  maxDeliver?: number;
}

/**
 * Asynchronous messaging port. Services depend on this interface only;
 * `NatsEventBus` is the production adapter, `InMemoryEventBus` serves tests.
 * Delivery is at-least-once: handlers must be idempotent (use `event.id`).
 */
export interface EventBus {
  publish<T extends EventType>(type: T, data: EventPayload<T>): Promise<void>;
  publishEnvelope(envelope: EventEnvelope): Promise<void>;
  subscribe<T extends EventType>(type: T, options: SubscribeOptions, handler: EventHandler<T>): Promise<void>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

/** Builds an envelope with a fresh id (e.g. to store it in an outbox before publishing). */
export function createEnvelope<T extends EventType>(type: T, data: EventPayload<T>): EventEnvelope<T> {
  return { id: randomUUID(), type, occurredAt: new Date().toISOString(), data: parseEventPayload(type, data) };
}

/** NATS JetStream adapter: durable streams and consumers survive restarts of any service. */
export class NatsEventBus implements EventBus {
  private readonly subscriptions: ConsumerMessages[] = [];

  private constructor(
    private readonly nc: NatsConnection,
    private readonly js: JetStreamClient,
    private readonly jsm: JetStreamManager,
    private readonly log: Logger,
  ) {}

  static async connect(options: { url: string; name: string; log: Logger }): Promise<NatsEventBus> {
    const nc = await connect({ servers: options.url, name: options.name, maxReconnectAttempts: -1 });
    const jsm = await nc.jetstreamManager();
    await ensureStream(jsm);
    return new NatsEventBus(nc, nc.jetstream(), jsm, options.log);
  }

  async publish<T extends EventType>(type: T, data: EventPayload<T>): Promise<void> {
    await this.publishEnvelope(createEnvelope(type, data));
  }

  /** Publishes a prepared envelope. JetStream de-duplicates by `msgID`, so retries are safe. */
  async publishEnvelope(envelope: EventEnvelope): Promise<void> {
    await this.js.publish(SUBJECT_PREFIX + envelope.type, codec.encode(envelope), { msgID: envelope.id });
  }

  async subscribe<T extends EventType>(type: T, options: SubscribeOptions, handler: EventHandler<T>): Promise<void> {
    await this.jsm.consumers.add(STREAM, {
      durable_name: options.durable,
      filter_subject: SUBJECT_PREFIX + type,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      max_deliver: options.maxDeliver ?? 10,
      ack_wait: 60_000_000_000, // 60s in nanoseconds
    });
    const consumer = await this.js.consumers.get(STREAM, options.durable);
    const messages = await consumer.consume();
    this.subscriptions.push(messages);

    void (async () => {
      for await (const message of messages) {
        let envelope: EventEnvelope<T>;
        try {
          const raw = codec.decode(message.data);
          envelope = { ...raw, type, data: parseEventPayload(type, raw.data) } as EventEnvelope<T>;
        } catch (error) {
          this.log.error({ err: error, subject: message.subject }, 'Malformed event, terminating delivery');
          message.term();
          continue;
        }

        try {
          await handler(envelope);
          message.ack();
        } catch (error) {
          const attempt = message.info.deliveryCount;
          this.log.warn({ err: error, eventId: envelope.id, type, attempt }, 'Event handler failed, will retry');
          message.nak(Math.min(30_000, 1_000 * 2 ** attempt));
        }
      }
    })();
  }

  async ping(): Promise<void> {
    await this.nc.flush();
  }

  async close(): Promise<void> {
    for (const subscription of this.subscriptions) subscription.stop();
    await this.nc.drain();
  }
}

async function ensureStream(jsm: JetStreamManager): Promise<void> {
  const config = {
    name: STREAM,
    subjects: [`${SUBJECT_PREFIX}>`],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_age: 30 * 24 * 60 * 60 * 1_000_000_000, // 30 days in nanoseconds
    duplicate_window: 2 * 60 * 1_000_000_000, // 2 minutes
  };
  try {
    await jsm.streams.info(STREAM);
    await jsm.streams.update(STREAM, config);
  } catch {
    await jsm.streams.add(config);
  }
}
