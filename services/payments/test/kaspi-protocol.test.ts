import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { kaspiOutcome, kaspiPhone, parseKaspiOperation, parseKaspiWebhook, verifyKaspiSignature } from '../src/providers/kaspi/kaspi-protocol';

describe('kaspi protocol', () => {
  it('maps Kaspi statuses to payment outcomes', () => {
    expect(kaspiOutcome('Processed')).toBe('succeeded');
    expect(kaspiOutcome('RemotePaymentCanceled')).toBe('cancelled');
    expect(kaspiOutcome('Expired')).toBe('cancelled');
    expect(kaspiOutcome('NotConfirmedByUser')).toBe('failed');
    expect(kaspiOutcome('Wait')).toBe('pending');
    expect(kaspiOutcome(undefined)).toBe('pending');
  });

  it('accepts only Kazakh mobile numbers in Kaspi format', () => {
    expect(kaspiPhone('+7 701 234 56 78')).toBe('77012345678');
    expect(kaspiPhone('87472345678')).toBe('77472345678');
    expect(kaspiPhone('7012345678')).toBe('77012345678');
    expect(kaspiPhone('+77272345678')).toBeNull(); // Almaty landline
    expect(kaspiPhone('+79161234567')).toBeNull(); // Russia
  });

  it('reads operations in both field cases', () => {
    expect(parseKaspiOperation({ StatusCode: 0, Data: { Id: 42, Status: 'Wait' } })).toEqual({ statusCode: 0, id: '42', status: 'Wait' });
    expect(parseKaspiOperation({ statusCode: -1, data: { operationId: 'x' } })).toEqual({ statusCode: -1, id: 'x', status: null });
  });

  it('parses webhooks and verifies the signature', () => {
    const body = Buffer.from(JSON.stringify({ event: 'payment.success', paymentId: '42', type: 'invoice', status: 'Processed' }));
    const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
    expect(verifyKaspiSignature(body, signature, 'secret')).toBe(true);
    expect(verifyKaspiSignature(body, signature, 'other')).toBe(false);
    expect(verifyKaspiSignature(body, undefined, 'secret')).toBe(false);
    expect(parseKaspiWebhook(JSON.parse(body.toString()))).toEqual({ externalId: '42', outcome: 'succeeded' });
    expect(parseKaspiWebhook({ event: 'payment.lost', paymentId: '42' })).toEqual({ externalId: '42', outcome: null });
    expect(parseKaspiWebhook({ event: 'something', paymentId: '42' })).toBeNull();
  });
});
