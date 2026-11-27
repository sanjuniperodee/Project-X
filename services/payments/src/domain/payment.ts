import type { PaymentKind, PaymentStatus } from '@px/contracts';

export interface Payment {
  id: string;
  projectId: string;
  kind: PaymentKind;
  amount: number;
  description: string;
  status: PaymentStatus;
  provider: string;
  externalId: string | null;
  redirectUrl: string;
  returnUrl: string;
  createdAt: Date;
  paidAt: Date | null;
}

export class PaymentRuleViolation extends Error {
  override readonly name = 'PaymentRuleViolation';
}

/**
 * Settles a payment. Returns true when the status actually changed —
 * repeated provider callbacks for the same payment are a normal occurrence and are ignored.
 */
export function settle(payment: Payment, outcome: 'succeeded' | 'failed' | 'cancelled'): boolean {
  if (payment.status === outcome) return false;
  if (payment.status !== 'pending') {
    throw new PaymentRuleViolation(`Платёж уже в статусе «${payment.status}»`);
  }
  payment.status = outcome;
  if (outcome === 'succeeded') payment.paidAt = new Date();
  return true;
}
