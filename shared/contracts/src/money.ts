import { z } from 'zod';

/**
 * Money is stored as an integer amount of tenge (KZT).
 * Tiyn are not used in retail pricing, so integers keep arithmetic exact.
 */
export const Tenge = z.number().int().nonnegative();
export type Tenge = z.infer<typeof Tenge>;

const formatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

/** 25000 -> "25 000 ₸" (with a non-breaking space before the sign). */
export function formatTenge(amount: Tenge): string {
  return `${formatter.format(amount)} ₸`;
}
