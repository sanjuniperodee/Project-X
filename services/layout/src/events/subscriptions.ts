import type { EventBus } from '@px/service-kit';
import type { LayoutService } from '../application/layout-service';

export async function subscribeToEvents(bus: EventBus, layouts: LayoutService) {
  // One layout at a time per replica: the JetStream consumer delivers sequentially and
  // the bus keeps the message alive while the PDF renders. Five attempts, then `layout.failed`.
  await bus.subscribe('ai.draft_generated', { durable: 'layout--ai-draft-generated', maxDeliver: 5 }, (event, delivery) =>
    layouts.handleDraftGenerated(event, delivery),
  );
}
