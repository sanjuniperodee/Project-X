import type { DraftContent, EventPayload, Product } from '@px/contracts';

export interface DraftRequest {
  product: Product;
  project: EventPayload<'projects.submitted'>;
  /** Set when the customer asked for changes to a layout built from `previous`. */
  revision?: { round: number; previous: DraftContent; comment: string };
}

/** Produces the editorial draft a designer starts the layout from. */
export interface DraftGenerator {
  readonly id: string;
  generate(request: DraftRequest): Promise<DraftContent>;
}
