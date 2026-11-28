/**
 * Public Claude prices, $ per million tokens (input, output, cache read, cache write 5 min).
 * Used to estimate the studio's AI spend; the Anthropic invoice is the source of truth.
 */
const PRICES: Record<string, [number, number, number, number]> = {
  'claude-fable-5-2': [8, 40, 0.2, 10],
  'claude-opus-5-5': [4, 20, 0.2, 5],
  'claude-opus-5': [5, 25, 0.5, 6.25],
  'claude-opus-4-8': [5, 25, 0.5, 6.25],
  'claude-sonnet-5-5': [2, 10, 0.1, 2.5],
  'claude-sonnet-5': [2, 10, 0.2, 2.5],
  'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125],
};

export function priceOf(model: string) {
  const key = Object.keys(PRICES).find((k) => model === k || model.startsWith(`${k}-`)) ?? 'claude-opus-5-5';
  return PRICES[key]!;
}

export function costUsd(u: { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }) {
  const [input, output, read, write] = priceOf(u.model);
  return (u.inputTokens * input + u.outputTokens * output + u.cacheReadTokens * read + u.cacheWriteTokens * write) / 1_000_000;
}
