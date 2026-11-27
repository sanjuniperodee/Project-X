import type { EventEnvelope } from '@px/contracts';
import type { EventBus, Logger } from './events';

/**
 * Storage side of a transactional outbox. Implemented by each service over its own DB.
 * `claimBatch` must run inside a transaction that locks the rows (FOR UPDATE SKIP LOCKED),
 * so several replicas can relay concurrently without double-publishing.
 */
export interface OutboxStore {
  withClaimedBatch(limit: number, publish: (envelopes: EventEnvelope[]) => Promise<string[]>): Promise<number>;
}

export interface OutboxRelayOptions {
  store: OutboxStore;
  bus: EventBus;
  log: Logger;
  intervalMs?: number;
  batchSize?: number;
}

/**
 * Publishes committed outbox events to the bus. State changes and their events are
 * written in one DB transaction, so an event is never lost and never sent for a rolled-back change.
 */
export class OutboxRelay {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopped = false;

  constructor(private readonly options: OutboxRelayOptions) {}

  start(): void {
    this.stopped = false;
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 20));
  }

  /** Publishes everything pending right now; returns the number of events sent. */
  async flush(): Promise<number> {
    const { store, bus } = this.options;
    const batchSize = this.options.batchSize ?? 50;
    let total = 0;
    for (;;) {
      const sent = await store.withClaimedBatch(batchSize, async (envelopes) => {
        const published: string[] = [];
        for (const envelope of envelopes) {
          await bus.publishEnvelope(envelope);
          published.push(envelope.id);
        }
        return published;
      });
      total += sent;
      if (sent < batchSize) return total;
    }
  }

  private schedule(delay: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  private async tick(): Promise<void> {
    this.running = true;
    try {
      await this.flush();
    } catch (error) {
      this.options.log.error({ err: error }, 'Outbox relay failed, will retry');
    } finally {
      this.running = false;
      this.schedule(this.options.intervalMs ?? 500);
    }
  }
}
