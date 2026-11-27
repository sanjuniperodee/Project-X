import type { DraftContent, EventPayload, Product } from '@px/contracts';

export interface DraftRequest {
  product: Product;
  project: EventPayload<'projects.submitted'>;
}

/** Produces the editorial draft a designer starts the layout from. */
export interface DraftGenerator {
  readonly id: string;
  generate(request: DraftRequest): Promise<DraftContent>;
}
