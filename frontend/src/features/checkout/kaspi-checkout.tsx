'use client';

import { useEffect, useState } from 'react';
import { formatTenge, type PaymentView } from '@px/contracts';
import { browserApi } from '@/shared/api/browser';
import { Notice } from '@/shared/ui/notice';

const POLL_MS = 3000;

/**
 * Kaspi Pay: the invoice is already in the customer's Kaspi.kz app (pushed to the order's phone number).
 * This page follows the payment and returns to the project as soon as it is paid.
 */
export function KaspiCheckout({ payment: initial }: { payment: PaymentView }) {
  const [payment, setPayment] = useState(initial);

  useEffect(() => {
    if (payment.status === 'succeeded') {
      window.location.assign(payment.returnUrl);
      return;
    }
    if (payment.status !== 'pending') return;
    const timer = setTimeout(() => {
      browserApi
        .payment(payment.id)
        .then(setPayment)
        .catch(() => setPayment((p) => ({ ...p })));
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [payment]);

  const back = payment.returnUrl.replace(/[?&]payment=[^&]*/, '');

  return (
    <div className="w-full max-w-md rounded-card bg-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_12px_32px_-12px_rgba(0,0,0,0.18)] sm:p-8">
      <p className="text-sm text-muted">Оплата через Kaspi.kz</p>
      <p className="mt-6 text-4xl font-semibold tabular-nums">{formatTenge(payment.amount)}</p>
      <p className="mt-2 leading-relaxed">{payment.description}</p>

      {payment.status === 'pending' && (
        <>
          <ol className="mt-6 flex list-decimal flex-col gap-2 rounded-control bg-bg px-4 py-3 pl-8 text-sm leading-relaxed">
            <li>Откройте приложение Kaspi.kz на телефоне, номер которого вы указали в заказе.</li>
            <li>
              Найдите счёт в разделе <b>«Уведомления»</b> или <b>«Платежи» → «Счета на оплату»</b>.
            </li>
            <li>Подтвердите оплату. Эта страница обновится сама.</li>
          </ol>
          <p className="mt-6 flex items-center gap-3 text-sm text-muted" role="status" aria-live="polite">
            <span className="inline-block size-3 animate-pulse rounded-full bg-accent" aria-hidden />
            Ждём подтверждения от Kaspi…
          </p>
          <a href={back} className="mt-6 inline-block text-sm underline underline-offset-4">
            Вернуться к проекту
          </a>
        </>
      )}

      {payment.status === 'succeeded' && (
        <div className="mt-6">
          <Notice tone="success">Оплата прошла. Возвращаем вас к проекту…</Notice>
        </div>
      )}

      {(payment.status === 'failed' || payment.status === 'cancelled') && (
        <div className="mt-6 flex flex-col gap-4">
          <Notice tone="info">
            {payment.status === 'failed' ? 'Kaspi не провёл оплату.' : 'Счёт отменён или истёк.'} Можно выставить новый счёт из проекта.
          </Notice>
          <a href={back} className="underline underline-offset-4">
            Вернуться к проекту
          </a>
        </div>
      )}
    </div>
  );
}
