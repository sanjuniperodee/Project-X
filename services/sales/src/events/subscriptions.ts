import type { EventBus } from '@px/service-kit';
import type { SalesService } from '../application/sales-service';

export async function subscribeToEvents(bus: EventBus, sales: SalesService) {
  await bus.subscribe('projects.status_changed', { durable: 'sales--projects-status-changed' }, (event) =>
    sales.handleStatusChanged(event),
  );
}
