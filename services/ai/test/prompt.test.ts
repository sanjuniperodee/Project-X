import { Product } from '@px/contracts';
import { describe, expect, it } from 'vitest';
import { glossy } from '../../catalog/src/products/glossy';
import { draftPrompt } from '../src/generators/claude';

const product = Product.parse(glossy);
const project = (answers: Record<string, Record<string, unknown>>) => ({
  projectId: 'p-1',
  productId: 'glossy' as const,
  subject: 'Айгерим',
  formatId: 'a4-36',
  answers,
  contributions: [],
});

describe('Claude draft prompt', () => {
  it('states the tone the customer chose as a requirement for every text', () => {
    const prompt = draftPrompt({ product, project: project({ hero: { heroName: 'Айгерим' }, issue: { voice: 'humor' } }) });
    expect(prompt).toContain('<tone>');
    expect(prompt).toContain('«С юмором и самоиронией» — Смешно и по-доброму');
  });

  it('keeps the tone in revisions', () => {
    const previous = { title: 'T', lead: 'L', sections: [], cards: [] };
    const prompt = draftPrompt({
      product,
      project: project({ issue: { voice: 'elegant' } }),
      revision: { round: 1, previous, comment: 'Поменяйте заголовок' },
    });
    expect(prompt).toContain('<customer_comment>');
    expect(prompt).toContain('Исправленные места пиши в том же тоне «Сдержанный и элегантный»');
  });

  it('leaves the voice to the style of the issue when no tone was chosen', () => {
    const prompt = draftPrompt({ product, project: project({ hero: { heroName: 'Айгерим' } }) });
    expect(prompt).not.toContain('Заказчик выбрал тон текстов');
    expect(prompt).toContain('Стиль номера');
  });
});
