import { PRODUCT_IDS, type ProductId } from '@px/contracts';
import { getBrand } from '@/brands';

/**
 * The studio's projects as the back office shows them: a colour and a monogram each, so an
 * order of Cover Me is told from an order of Шежіре at a glance in every list, board and chart.
 * Colours are checked for colour-blind separation; they always sit next to the project's name.
 */
export interface ProjectIdentity {
  id: ProductId;
  name: string;
  monogram: string;
  color: string;
  /** Light tint of the colour for backgrounds. */
  tint: string;
}

const LOOK: Record<ProductId, Pick<ProjectIdentity, 'monogram' | 'color' | 'tint'>> = {
  glossy: { monogram: 'CM', color: '#d4006f', tint: '#fdeaf3' },
  shezhire: { monogram: 'Ш', color: '#2b4c9b', tint: '#e9eef9' },
  boardgame: { monogram: 'MG', color: '#d89a00', tint: '#fcf3dc' },
};

export const PROJECTS: ProjectIdentity[] = PRODUCT_IDS.map((id) => ({ id, name: getBrand(id).name, ...LOOK[id] }));

export function project(id: ProductId): ProjectIdentity {
  return PROJECTS.find((p) => p.id === id)!;
}

/** What the back office is looking at: one project, or all of them (`null`). */
export type Scope = ProductId | null;

export const SCOPE_COOKIE = 'px_admin_scope';

export function parseScope(value: string | undefined): Scope {
  return PRODUCT_IDS.find((id) => id === value) ?? null;
}
