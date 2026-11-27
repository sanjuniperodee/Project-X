import { describe, expect, it } from 'vitest';
import { calculateQuote } from '@px/contracts';
import { ProductRegistry } from '../src/products';

describe('ProductRegistry', () => {
  const registry = new ProductRegistry();

  it('loads and validates all product definitions', () => {
    expect(registry.list().map((p) => p.id)).toEqual(['glossy', 'shezhire', 'boardgame']);
  });

  it('prices every format above the deposit', () => {
    for (const product of registry.list()) {
      for (const format of product.formats) {
        const quote = calculateQuote(product, { formatId: format.id });
        expect(quote.balance).toBeGreaterThanOrEqual(0);
        expect(quote.deposit).toBe(product.deposit);
      }
    }
  });
});
