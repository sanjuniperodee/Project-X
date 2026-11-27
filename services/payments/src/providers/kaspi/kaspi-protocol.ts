import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentOutcome } from '../provider';

/**
 * Protocol of kaspi-pos-automation (github.com/tapter-dev/kaspi-pos-automation), the cashier sidecar that
 * MyBooks and Project X share on the server. Pure functions: statuses, phone format, webhook signature.
 */

const PAID = new Set(['processed', 'paid', 'success', 'succeeded']);
const CANCELLED = new Set(['cancelledbyuser', 'cancelledbyexternalsource', 'remotepaymentcanceled', 'cancelled', 'canceled']);
const EXPIRED = new Set(['expired', 'qrtokendiscarded', 'qertokendiscarded', 'sessionexpired']);
const FAILED = new Set([
  'notconfirmedbyuser',
  'processingfailed',
  'rejected',
  'insufficientfunds',
  'insufficientfundserror',
  'error',
  'remotepaymentrejected',
  'failed',
]);

/** Kaspi status ("Processed", "RemotePaymentCanceled"…) → our outcome. Unknown statuses mean the invoice still waits. */
export function kaspiOutcome(status: string | null | undefined): PaymentOutcome | 'pending' {
  const s = String(status ?? '').trim().toLowerCase();
  if (PAID.has(s)) return 'succeeded';
  if (CANCELLED.has(s) || EXPIRED.has(s)) return 'cancelled';
  if (FAILED.has(s)) return 'failed';
  return 'pending';
}

/** Kaspi bills Kazakh mobile numbers only: 7 70x/747/75x–77x + 7 digits. null when the number cannot get an invoice. */
export function kaspiPhone(raw: string | null | undefined): string | null {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`;
  else if (d.length === 10) d = `7${d}`;
  return /^7(?:70\d|747|7[567]\d)\d{7}$/.test(d) ? d : null;
}

const record = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function text(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return null;
}

/** kaspi-pos answers `{ StatusCode, Data: { Id | OperationId, Status, … } }`; field case differs between versions. */
export function parseKaspiOperation(body: unknown): { statusCode: number; id: string | null; status: string | null } {
  const root = record(body);
  const data = record(root?.Data) ?? record(root?.data) ?? root;
  return {
    statusCode: Number(root?.StatusCode ?? root?.statusCode ?? 0),
    id: text(data?.Id, data?.id, data?.OperationId, data?.operationId, data?.QrOperationId, data?.qrOperationId),
    status: text(data?.Status, data?.status),
  };
}

const EVENTS: Record<string, PaymentOutcome | null> = {
  'payment.success': 'succeeded',
  'payment.failed': 'failed',
  'payment.expired': 'cancelled',
  // kaspi-pos stopped tracking the payment: no result, check it.
  'payment.lost': null,
};

/** Webhook body: `{ event, paymentId, type: "invoice" | "qr", status, amount }`. null: not a payment notification. */
export function parseKaspiWebhook(body: unknown): { externalId: string; outcome: PaymentOutcome | null } | null {
  const root = record(body);
  const event = String(root?.event ?? '');
  const externalId = text(root?.paymentId);
  if (!root || !externalId || !(event in EVENTS)) return null;
  return { externalId, outcome: EVENTS[event] ?? null };
}

/** `X-Webhook-Signature: sha256=<hex HMAC-SHA256(body, secret)>`, compared in constant time. */
export function verifyKaspiSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const got = Buffer.from(signature.trim());
  return expected.length === got.length && timingSafeEqual(expected, got);
}
