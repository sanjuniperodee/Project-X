import { z } from 'zod';
import { Tenge } from './money';
import { PaymentKind } from './projects';

export const PaymentStatus = z.enum(['pending', 'succeeded', 'failed', 'cancelled']);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

/** Internal request from the projects service. Amount is computed server-side, never by the browser. */
export const CreatePaymentRequest = z.object({
  projectId: z.string().min(1),
  kind: PaymentKind,
  amount: Tenge.positive(),
  description: z.string().min(1).max(200),
  /** Where the customer returns after paying. */
  returnUrl: z.url(),
  /** Customer phone as entered (digits, optional +). Invoice providers (Kaspi Pay) send the bill to it. */
  customerPhone: z.string().regex(/^\+?\d{10,15}$/).optional(),
});
export type CreatePaymentRequest = z.infer<typeof CreatePaymentRequest>;

export const PaymentView = z.object({
  id: z.string(),
  projectId: z.string(),
  kind: PaymentKind,
  amount: Tenge,
  description: z.string(),
  status: PaymentStatus,
  provider: z.string(),
  redirectUrl: z.string(),
  returnUrl: z.string(),
  createdAt: z.iso.datetime(),
  paidAt: z.iso.datetime().nullable(),
});
export type PaymentView = z.infer<typeof PaymentView>;
