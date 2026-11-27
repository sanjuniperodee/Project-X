'use client';

import { useState } from 'react';
import { formatTenge, type PaymentView } from '@px/contracts';
import { browserApi } from '@/shared/api/browser';
import { ApiError } from '@/shared/api/core';
import { Button } from '@/shared/ui/button';
import { Notice } from '@/shared/ui/notice';

/**
 * Stand-in for a real payment provider page (Kaspi, Freedom Pay…),
 * active only while the payments service runs the mock provider.
 */
export function MockCheckout({ payment }: { payment: PaymentView }) {
  const [pending, setPending] = useState<'success' | 'fail' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function finish(outcome: 'success' | 'fail') {
    setError(null);
    setPending(outcome);
    try {
      await browserApi.confirmMockPayment(payment.id, outcome);
      window.location.assign(outcome === 'success' ? payment.returnUrl : payment.returnUrl.replace(/[?&]payment=[^&]*/, ''));
    } catch (e) {
      setPending(null);
      setError(e instanceof ApiError ? e.message : 'Платёж не прошёл. Попробуйте ещё раз.');
    }
  }

  const done = payment.status !== 'pending';

  return (
    <div className="w-full max-w-md rounded-card bg-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_12px_32px_-12px_rgba(0,0,0,0.18)] sm:p-8">
      <p className="text-sm text-muted">Тестовая оплата</p>
      <p className="mt-6 text-4xl font-semibold tabular-nums">{formatTenge(payment.amount)}</p>
      <p className="mt-2 leading-relaxed">{payment.description}</p>
      <div className="mt-6 rounded-control bg-bg px-4 py-3 text-sm leading-relaxed text-muted">
        Это имитация платёжной страницы для разработки. Деньги не списываются.
      </div>
      {done ? (
        <div className="mt-6 flex flex-col gap-4">
          <Notice tone={payment.status === 'succeeded' ? 'success' : 'info'}>
            {payment.status === 'succeeded' ? 'Этот платёж уже оплачен.' : 'Этот платёж закрыт.'}
          </Notice>
          <a href={payment.returnUrl} className="underline underline-offset-4">
            Вернуться к проекту
          </a>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-3">
          <Button size="lg" loading={pending === 'success'} disabled={pending !== null} onClick={() => void finish('success')}>
            Оплатить {formatTenge(payment.amount)}
          </Button>
          <Button variant="secondary" loading={pending === 'fail'} disabled={pending !== null} onClick={() => void finish('fail')}>
            Отменить оплату
          </Button>
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
      )}
    </div>
  );
}
