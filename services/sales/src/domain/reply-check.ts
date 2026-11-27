import type { Product } from '@px/contracts';

/**
 * Checks of the bot's text before it goes to the customer (borrowed from the MyBooks seller):
 * money and percentages only from the catalog and this turn's tool results, no card numbers, IBANs or other phones,
 * links only to our sites. A failed check gets one rewrite; a second failure hands the chat to the studio.
 */

/** "25 000", "25,000", "25000", "10к", "10 тыс", "10 мың" next to a currency or a money word. */
export function amountsIn(text: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,3}(?:[   .,]\d{3})+|\d+)\s*(к|k|тыс\.?|тысяч|мың)?\s*(₸|тг|тенге|теңге|kzt)?/gi;
  for (const m of text.matchAll(re)) {
    const [, raw, thousands, currency] = m;
    if (!thousands && !currency) continue; // a bare number: page count, date, year
    let n = Number(raw!.replace(/[   .,]/g, ''));
    if (thousands) n *= 1000;
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

export const percentsIn = (text: string) => [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map((m) => Number(m[1]!.replace(',', '.')));

/** Every amount the bot may name: prices, extras (× quantity), deposit, price + extras, balance. */
export function allowedAmounts(products: Product[], extra: number[] = []): Set<number> {
  const out = new Set<number>(extra);
  for (const p of products) {
    out.add(p.deposit);
    for (const f of p.formats) {
      out.add(f.price);
      out.add(f.price - p.deposit);
      let withExtras = [f.price];
      for (const e of p.extras) {
        for (let q = 1; q <= Math.min(e.maxQuantity, 10); q++) out.add(e.unitPrice * q);
        withExtras = withExtras.flatMap((sum) => [sum, ...Array.from({ length: Math.min(e.maxQuantity, 5) }, (_, i) => sum + e.unitPrice * (i + 1))]);
      }
      for (const sum of withExtras.slice(0, 500)) {
        out.add(sum);
        out.add(sum - p.deposit);
      }
    }
  }
  return out;
}

const luhn = (digits: string) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
};

/** Card numbers, IBANs, payment links and phone numbers other than ours and the customer's. */
export function sensitiveIn(text: string, allowedPhones: string[]): string[] {
  const problems: string[] = [];
  for (const m of text.matchAll(/(?:\d[ -]?){13,19}/g)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) problems.push('номер карты');
  }
  if (/\bKZ\d{2}[0-9A-Z ]{10,}/i.test(text)) problems.push('IBAN');
  if (/kaspi\.kz\/(pay|transfer|p2p)|pay\.kaspi\.kz/i.test(text)) problems.push('ссылка на перевод Kaspi');
  const allowed = allowedPhones.map((p) => p.replace(/\D/g, '').slice(-10));
  for (const m of text.matchAll(/(?:\+?7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g)) {
    const tail = m[0].replace(/\D/g, '').slice(-10);
    if (!allowed.includes(tail)) problems.push('чужой номер телефона');
  }
  return [...new Set(problems)];
}

export interface CheckContext {
  amounts: Set<number>;
  allowedOrigins: string[];
  allowedPhones: string[];
}

export function checkReply(text: string, ctx: CheckContext): string[] {
  const problems: string[] = [];
  const foreignAmounts = amountsIn(text).filter((a) => !ctx.amounts.has(a));
  if (foreignAmounts.length) problems.push(`суммы не из каталога: ${foreignAmounts.map((a) => a.toLocaleString('ru-RU')).join(', ')} ₸ — называй только цены из get_products и суммы из ответов инструментов`);
  if (percentsIn(text).length) problems.push('проценты и скидки: у студии нет скидок, не называй проценты');
  problems.push(...sensitiveIn(text, ctx.allowedPhones).map((p) => `${p}: никогда не пиши реквизиты и чужие номера`));
  for (const m of text.matchAll(/https?:\/\/[^\s)]+/g)) {
    try {
      if (!ctx.allowedOrigins.includes(new URL(m[0]).origin)) problems.push(`ссылка ${m[0]}: давай только ссылки из ответов инструментов`);
    } catch {
      problems.push('битая ссылка');
    }
  }
  return problems;
}

/** Paragraphs go as separate WhatsApp messages, at most three (the last one takes the rest). */
export function splitReply(text: string, max = 3): string[] {
  const parts = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= max) return parts;
  return [...parts.slice(0, max - 1), parts.slice(max - 1).join('\n\n')];
}

/** The customer asked something: silence is not an answer. */
export const asksSomething = (text: string) =>
  /\?|сколько|стоит|цена|когда|как |можно ли|можно\b|успеете|человек|менеджер|позвон|қанша|қашан|бағасы/i.test(text);
