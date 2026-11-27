import type { EventBus } from '@px/service-kit';
import type { ProjectService } from '../application/project-service';

export async function subscribeToEvents(bus: EventBus, projects: ProjectService) {
  await bus.subscribe('payments.succeeded', { durable: 'projects--payments-succeeded' }, (event) =>
    projects.handlePaymentSucceeded(event),
  );
  await bus.subscribe('ai.draft_generated', { durable: 'projects--ai-draft-generated' }, (event) =>
    projects.handleDraftGenerated(event),
  );
  await bus.subscribe('layout.generated', { durable: 'projects--layout-generated' }, (event) =>
    projects.handleLayoutGenerated(event),
  );
  await bus.subscribe('layout.failed', { durable: 'projects--layout-failed' }, (event) => projects.handleLayoutFailed(event));
}
