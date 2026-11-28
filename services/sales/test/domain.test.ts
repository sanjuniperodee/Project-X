import { describe, expect, it } from 'vitest';
import { cardFromGowaPayload, parseRetailerId, planCatalog, retailerIdOf, type WaProduct, type WantedProduct } from '../src/domain/catalog';
import { followUpDue, isWorkTime, nextWorkStart } from '../src/domain/follow-ups';
import { amountsIn, asksSomething, checkReply, percentsIn, sensitiveIn, splitReply } from '../src/domain/reply-check';

describe('reply check', () => {
  it('finds money only next to a currency or thousands', () => {
    expect(amountsIn('Журнал 24 страницы за 25 000 ₸, предоплата 10к, в 2026 году')).toEqual([25_000, 10_000]);
    expect(amountsIn('35,000 тенге или 35 тыс')).toEqual([35_000, 35_000]);
    expect(percentsIn('скидка 10% и 2,5 %')).toEqual([10, 2.5]);
  });

  it('flags card numbers, IBANs, Kaspi transfer links and foreign phones', () => {
    expect(sensitiveIn('карта 4111 1111 1111 1111', [])).toEqual(['номер карты']);
    expect(sensitiveIn('KZ86125KZT5004100100', [])).toEqual(['IBAN']);
    expect(sensitiveIn('переведите https://pay.kaspi.kz/pay/abc', [])).toEqual(['ссылка на перевод Kaspi']);
    expect(sensitiveIn('звоните +7 701 555 66 77', ['77015556677'])).toEqual([]);
    expect(sensitiveIn('звоните 8 702 000 11 22', ['77015556677'])).toEqual(['чужой номер телефона']);
  });

  it('accepts catalog money and our links, rejects the rest', () => {
    const ctx = { amounts: new Set([25_000, 10_000]), allowedOrigins: ['https://coverme.test'], allowedPhones: [] };
    expect(checkReply('25 000 ₸, предоплата 10 000 ₸: https://coverme.test/p/x', ctx)).toEqual([]);
    expect(checkReply('всего 19 990 ₸ со скидкой 10% — https://evil.example', ctx)).toHaveLength(3);
  });

  it('splits paragraphs into at most three messages', () => {
    expect(splitReply('a\n\nb\n\nc\n\nd')).toEqual(['a', 'b', 'c\n\nd']);
    expect(splitReply('one line')).toEqual(['one line']);
  });

  it('knows a question from a thank-you', () => {
    expect(asksSomething('спасибо, понятно')).toBe(false);
    expect(asksSomething('а сколько стоит доставка')).toBe(true);
    expect(asksSomething('қанша тұрады')).toBe(true);
  });
});

describe('whatsapp catalog plan', () => {
  const w = (formatId: string, price: number): WantedProduct => ({
    retailerId: retailerIdOf('glossy', formatId), productId: 'glossy', formatId, name: `Cover Me — ${formatId}`, description: 'd', price, url: 'https://coverme.test',
  });
  const have = (id: string, x: WantedProduct, extra: Partial<WaProduct> = {}): WaProduct => ({
    id, name: x.name, description: x.description, price: x.price, currency: 'KZT', retailerId: x.retailerId, url: x.url, hidden: false, imageUrls: ['img'], review: 'APPROVED', ...extra,
  });

  it('creates new, edits only real differences, removes formats that are gone, ignores manual products', () => {
    const a = w('a', 25_000);
    const b = w('b', 35_000);
    const plan = planCatalog(
      [have('1', a), have('2', { ...b, price: 30_000 }), have('3', w('old', 1)), { ...have('4', a), retailerId: 'manual' }],
      [a, b, w('c', 45_000)],
      () => false,
    );
    expect(plan.unchanged.map((u) => u.id)).toEqual(['1']);
    expect(plan.update.map((u) => [u.id, u.keepImages])).toEqual([['2', ['img']]]);
    expect(plan.create.map((c) => c.formatId)).toEqual(['c']);
    expect(plan.remove.map((r) => r.id)).toEqual(['3']);
    // New photos: every product of that product is edited, old photos are not kept.
    expect(planCatalog([have('1', a)], [a], () => true).update[0]!.keepImages).toEqual([]);
  });

  it('round-trips retailer ids and parses inbound product cards', () => {
    expect(parseRetailerId('px:shezhire:book48')).toEqual({ productId: 'shezhire', formatId: 'book48' });
    expect(parseRetailerId('SKU-1')).toBeNull();
    expect(cardFromGowaPayload({ product: { product_id: '77', title: 'Cover Me', price_amount_1000: 25_000_000, retailer_id: 'px:glossy:a' } })).toEqual({
      kind: 'product', waProductId: '77', name: 'Cover Me', price: 25_000, retailerId: 'px:glossy:a',
    });
  });
});

describe('follow-ups', () => {
  const almaty = (h: number) => new Date(Date.UTC(2026, 10, 30, h - 5, 0));
  it('works 10:00–20:00 Almaty and waits for the next opening at night', () => {
    expect(isWorkTime(almaty(11))).toBe(true);
    expect(isWorkTime(almaty(22))).toBe(false);
    expect(nextWorkStart(almaty(22)).toISOString()).toBe('2026-12-01T05:00:00.000Z');
    expect(nextWorkStart(almaty(7)).toISOString()).toBe('2026-11-30T05:00:00.000Z');
  });

  it('follows the ladder: warm 20 min, cold 3 h, never at night', () => {
    const sentAt = almaty(12);
    const at = (min: number) => new Date(sentAt.getTime() + min * 60_000);
    expect(followUpDue({ followUps: 0, lastOurMessageAt: sentAt, warm: true, now: at(25) })).toBe(true);
    expect(followUpDue({ followUps: 0, lastOurMessageAt: sentAt, warm: false, now: at(25) })).toBe(false);
    expect(followUpDue({ followUps: 0, lastOurMessageAt: sentAt, warm: false, now: at(181) })).toBe(true);
    expect(followUpDue({ followUps: 0, lastOurMessageAt: sentAt, warm: false, now: at(11 * 60) })).toBe(false); // 23:00
    expect(followUpDue({ followUps: 2, lastOurMessageAt: sentAt, warm: false, now: at(2000) })).toBe(false); // ladder over
  });
});
