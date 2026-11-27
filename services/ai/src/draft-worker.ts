import type { EventEnvelope, Product, ProductId } from '@px/contracts';
import type { EventBus, Logger } from '@px/service-kit';
import type { DraftGenerator } from './generators/generator';

export interface DraftWorkerDeps {
  bus: EventBus;
  generator: DraftGenerator;
  catalog: { product(id: ProductId): Promise<Product> };
  log: Logger;
}

/** Listens for submitted projects and publishes generated drafts. Stateless: safe to scale out. */
export async function startDraftWorker({ bus, generator, catalog, log }: DraftWorkerDeps) {
  await bus.subscribe(
    'projects.submitted',
    { durable: 'ai--projects-submitted', maxDeliver: 5 },
    async (event: EventEnvelope<'projects.submitted'>) => {
      const started = Date.now();
      const product = await catalog.product(event.data.productId);
      const draft = await generator.generate({ product, project: event.data });
      await bus.publish('ai.draft_generated', { projectId: event.data.projectId, draft, generator: generator.id });
      log.info(
        { projectId: event.data.projectId, generator: generator.id, ms: Date.now() - started },
        'Draft generated',
      );
    },
  );
}
