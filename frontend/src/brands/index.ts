import { ProductId } from '@px/contracts';
import { boardgameBrand } from './boardgame';
import { glossyBrand } from './glossy';
import { shezhireBrand } from './shezhire';
import type { BrandDefinition } from './types';

/**
 * Brand registry. To add a product: define it in the catalog service,
 * add a folder here with its landing and copy, and register it below.
 */
const BRANDS: Record<ProductId, BrandDefinition> = {
  glossy: glossyBrand,
  shezhire: shezhireBrand,
  boardgame: boardgameBrand,
};

export const brandList = Object.values(BRANDS);

export function getBrand(id: ProductId): BrandDefinition {
  return BRANDS[id];
}

/** Resolves a route segment to a brand, or null for unknown values. */
export function findBrand(segment: string): BrandDefinition | null {
  const id = ProductId.safeParse(segment);
  return id.success ? BRANDS[id.data] : null;
}

export type { BrandDefinition, LandingProps } from './types';
