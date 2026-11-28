import type { EventBus } from '@px/service-kit';
import type { SalesService } from '../application/sales-service';
import type { UsageStore } from '../infrastructure/usage-store';

export async function subscribeToEvents(bus: EventBus, sales: SalesService, usage: UsageStore) {
  await bus.subscribe('projects.status_changed', { durable: 'sales--projects-status-changed' }, (event) =>
    sales.handleStatusChanged(event),
  );
  // The studio's AI spend in one place: the ai service reports its model calls as events.
  await bus.subscribe('ai.llm_used', { durable: 'sales--ai-llm-used' }, (event) =>
    usage.record({ id: event.id, at: new Date(event.occurredAt), ...event.data, conversationId: null }),
  );
}
