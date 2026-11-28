import { describe, expect, it } from 'vitest';
import { calculateQuote, ownerSteps } from '@px/contracts';
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

  it('asks every product for the tone of its texts, once and without making it required', () => {
    for (const product of registry.list()) {
      const tones = ownerSteps(product).flatMap((s) => s.fields).filter((f) => (f.type === 'choice' || f.type === 'select') && f.role === 'textTone');
      expect(tones, product.id).toHaveLength(1);
      expect(tones[0]!.type === 'choice' && tones[0]!.multiple).toBe(false);
    }
    const glossyTone = registry.list()[0]!.steps.find((s) => s.id === 'issue')!.fields.find((f) => f.id === 'voice')!;
    expect(glossyTone.required).toBe(false);
  });

  it('lets the Cover Me customer arrange the issue with optional questions only', () => {
    const issue = registry.list()[0]!.steps.find((s) => s.id === 'issue')!;
    expect(issue.fields.every((f) => !f.required)).toBe(true);
    const first = issue.fields.find((f) => f.id === 'firstRubrics')!;
    expect(first.type === 'choice' && first.multiple && first.ordered).toBe(true);
  });
});
