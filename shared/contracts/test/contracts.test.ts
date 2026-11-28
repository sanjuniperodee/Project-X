import { describe, expect, it } from 'vitest';
import { calculateQuote, canTransition, formatTenge, QuoteError, textToneOf, validateStep, type WizardStep } from '../src';
import { WizardStep as WizardStepSchema } from '../src';

const product = {
  deposit: 10_000,
  formats: [{ id: 'a4-24', name: 'A4, 24 стр.', description: '', price: 25_000, specs: [], recommended: false }],
  extras: [{ id: 'copy', name: 'Доп. экземпляр', description: '', unitPrice: 7_000, maxQuantity: 5 }],
};

describe('calculateQuote', () => {
  it('sums format and extras and splits deposit / balance', () => {
    const quote = calculateQuote(product, { formatId: 'a4-24', extras: { copy: 3 } });
    expect(quote.total).toBe(46_000);
    expect(quote.deposit).toBe(10_000);
    expect(quote.balance).toBe(36_000);
    expect(quote.lines).toHaveLength(2);
  });

  it('rejects unknown formats and quantities above the limit', () => {
    expect(() => calculateQuote(product, { formatId: 'nope' })).toThrow(QuoteError);
    expect(() => calculateQuote(product, { formatId: 'a4-24', extras: { copy: 6 } })).toThrow(QuoteError);
  });
});

describe('validateStep', () => {
  const step: WizardStep = WizardStepSchema.parse({
    id: 'hero',
    title: 'Герой',
    audience: 'owner',
    fields: [
      { id: 'name', type: 'text', label: 'Имя', required: true },
      { id: 'mood', type: 'choice', label: 'Настроение', options: [{ value: 'bold', label: 'Дерзко' }] },
      {
        id: 'friends',
        type: 'list',
        label: 'Друзья',
        itemLabel: 'Друг',
        addLabel: 'Добавить',
        fields: [{ id: 'name', type: 'text', label: 'Имя', required: true }],
      },
    ],
  });

  it('allows empty required fields in draft mode', () => {
    expect(validateStep(step, {}, 'draft').ok).toBe(true);
  });

  it('reports dot-path errors in final mode', () => {
    const result = validateStep(step, { friends: [{ name: '' }] }, 'final');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.name).toBeDefined();
      expect(result.errors['friends.0.name']).toBeDefined();
    }
  });

  it('strips unknown keys', () => {
    const result = validateStep(step, { name: 'Айгерим', hack: 1 }, 'final');
    expect(result.ok && result.data).toEqual({ name: 'Айгерим', mood: '', friends: [] });
  });
});

describe('project lifecycle', () => {
  it('only allows declared transitions', () => {
    expect(canTransition('draft', 'deposit_paid')).toBe(true);
    expect(canTransition('draft', 'paid')).toBe(false);
    expect(canTransition('delivered', 'cancelled')).toBe(false);
  });
});

it('formats tenge', () => {
  expect(formatTenge(25000)).toBe('25 000 ₸');
});

describe('choice fields with a role and an order', () => {
  const step = WizardStepSchema.parse({
    id: 'issue',
    title: 'Подача',
    audience: 'owner',
    fields: [
      { id: 'voice', type: 'choice', role: 'textTone', label: 'Тон', options: [{ value: 'warm', label: 'Тёплый', description: 'С любовью' }] },
      { id: 'order', type: 'choice', multiple: true, ordered: true, label: 'Порядок', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
      { id: 'plain', type: 'choice', label: 'Старое поле', options: [{ value: 'x', label: 'X' }] },
    ],
  });

  it('stay backward compatible: fields without the new keys parse as before', () => {
    const plain = step.fields[2]!;
    expect(plain.type === 'choice' && plain.ordered).toBe(false);
    expect(plain.type === 'choice' ? plain.role : 'not a choice').toBeUndefined();
  });

  it('keep the order of the picks', () => {
    const result = validateStep(step, { order: ['b', 'a'] }, 'draft');
    expect(result.ok && result.data.order).toEqual(['b', 'a']);
  });

  it('give the chosen tone with its description, or nothing', () => {
    expect(textToneOf({ steps: [step] }, { issue: { voice: 'warm' } })).toEqual({ label: 'Тёплый', description: 'С любовью' });
    expect(textToneOf({ steps: [step] }, { issue: {} })).toBeUndefined();
  });
});
