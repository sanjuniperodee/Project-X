import { z } from 'zod';
import { Tenge } from './money';
import type { Product } from './products';

/** What the customer picked: one format plus optional extras with quantities. */
export const QuoteSelection = z.object({
  formatId: z.string().min(1),
  extras: z.record(z.string(), z.number().int().nonnegative()).default({}),
});
export type QuoteSelection = z.infer<typeof QuoteSelection>;
export type QuoteSelectionInput = z.input<typeof QuoteSelection>;

export const QuoteLine = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: Tenge,
  total: Tenge,
});
export type QuoteLine = z.infer<typeof QuoteLine>;

/** Price snapshot. Stored with the project so later catalog price changes never affect a placed order. */
export const Quote = z.object({
  formatId: z.string(),
  lines: z.array(QuoteLine).min(1),
  total: Tenge,
  deposit: Tenge,
  balance: Tenge,
});
export type Quote = z.infer<typeof Quote>;

export class QuoteError extends Error {
  override readonly name = 'QuoteError';
}

/** Pure pricing function shared by the catalog, projects service and frontend. */
export function calculateQuote(
  product: Pick<Product, 'formats' | 'extras' | 'deposit'>,
  input: QuoteSelectionInput,
): Quote {
  const selection = QuoteSelection.parse(input);
  const format = product.formats.find((f) => f.id === selection.formatId);
  if (!format) throw new QuoteError(`Unknown format "${selection.formatId}"`);

  const lines: QuoteLine[] = [
    { id: format.id, name: format.name, quantity: 1, unitPrice: format.price, total: format.price },
  ];

  for (const [extraId, quantity] of Object.entries(selection.extras)) {
    if (quantity === 0) continue;
    const extra = product.extras.find((e) => e.id === extraId);
    if (!extra) throw new QuoteError(`Unknown extra "${extraId}"`);
    if (quantity > extra.maxQuantity) {
      throw new QuoteError(`"${extra.name}": maximum quantity is ${extra.maxQuantity}`);
    }
    lines.push({
      id: extra.id,
      name: extra.name,
      quantity,
      unitPrice: extra.unitPrice,
      total: extra.unitPrice * quantity,
    });
  }

  const total = lines.reduce((sum, line) => sum + line.total, 0);
  const deposit = Math.min(product.deposit, total);
  return { formatId: format.id, lines, total, deposit, balance: total - deposit };
}
