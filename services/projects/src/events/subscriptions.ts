import type { EventBus } from '@px/service-kit';
import type { ProjectService } from '../application/project-service';

export async function subscribeToEvents(bus: EventBus, projects: ProjectService) {
  await bus.subscribe('payments.succeeded', { durable: 'projects--payments-succeeded' }, (event) =>
    projects.handlePaymentSucceeded(event),
  );
  await bus.subscribe('ai.draft_generated', { durable: 'projects--ai-draft-generated' }, (event) =>
    projects.handleDraftGenerated(event),
  );
}
