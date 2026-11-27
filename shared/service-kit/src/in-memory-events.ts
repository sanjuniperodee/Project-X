import type { EventEnvelope, EventPayload, EventType } from '@px/contracts';
import { createEnvelope, type EventBus, type EventHandler, type SubscribeOptions } from './events';

/**
 * In-process event bus for tests: delivers to every subscriber, retries failed
 * handlers like the real bus, and lets tests await until all events are processed.
 */
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<EventType, Array<{ durable: string; handler: EventHandler<EventType> }>>();
  private readonly inFlight = new Set<Promise<void>>();
  readonly published: EventEnvelope[] = [];

  constructor(private readonly maxAttempts = 3) {}

  async publish<T extends EventType>(type: T, data: EventPayload<T>): Promise<void> {
    await this.publishEnvelope(createEnvelope(type, data));
  }

  async publishEnvelope(envelope: EventEnvelope): Promise<void> {
    this.published.push(envelope);
    for (const { handler } of this.handlers.get(envelope.type) ?? []) {
      const delivery = this.deliver(handler, envelope).finally(() => this.inFlight.delete(delivery));
      this.inFlight.add(delivery);
    }
  }

  async subscribe<T extends EventType>(type: T, options: SubscribeOptions, handler: EventHandler<T>): Promise<void> {
    const list = this.handlers.get(type) ?? [];
    list.push({ durable: options.durable, handler: handler as EventHandler<EventType> });
    this.handlers.set(type, list);
  }

  /** Resolves when every delivery (including chained events) has finished. */
  async drain(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight]);
  }

  async ping(): Promise<void> {}

  async close(): Promise<void> {
    await this.drain();
  }

  private async deliver(handler: EventHandler<EventType>, envelope: EventEnvelope): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await handler(envelope);
        return;
      } catch (error) {
        if (attempt >= this.maxAttempts) throw error;
      }
    }
  }
}
