import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { KaspiCheckout } from '@/features/checkout/kaspi-checkout';
import { api } from '@/shared/api/server';
import { ApiError } from '@/shared/api/core';

export const metadata: Metadata = { title: 'Оплата', robots: { index: false, follow: false } };

export default async function KaspiPaymentPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const payment = await api.payment(paymentId).catch((error: unknown) => {
    if (error instanceof ApiError && error.isNotFound) notFound();
    throw error;
  });
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <KaspiCheckout payment={payment} />
    </main>
  );
}
