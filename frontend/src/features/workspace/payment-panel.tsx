'use client';

import { useState } from 'react';
import { formatTenge, type PaymentKind, type ProjectView } from '@px/contracts';
import { browserApi } from '@/shared/api/browser';
import { ApiError } from '@/shared/api/core';
import { Button } from '@/shared/ui/button';
import { Notice } from '@/shared/ui/notice';

export function PaymentPanel({ editKey, project, confirming }: { editKey: string; project: ProjectView; confirming: boolean }) {
  const [pending, setPending] = useState<PaymentKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { quote, status } = project;

  async function pay(kind: PaymentKind) {
    setError(null);
    setPending(kind);
    try {
      const { redirectUrl } = await browserApi.checkout(editKey, kind);
      window.location.assign(redirectUrl);
    } catch (e) {
      setPending(null);
      setError(e instanceof ApiError ? e.message : 'Не удалось перейти к оплате. Попробуйте ещё раз.');
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-5" aria-labelledby="payment-title">
      <h2 id="payment-title" className="font-display text-xl font-semibold">
        Оплата
      </h2>
      <dl className="mt-4 space-y-1.5 text-[15px]">
        <Row label="Стоимость" value={formatTenge(quote.total)} />
        <Row label="Оплачено" value={formatTenge(project.paidAmount)} />
        {project.paidAmount < quote.total && <Row label="Осталось" value={formatTenge(quote.total - project.paidAmount)} />}
      </dl>

      <div className="mt-5">
        {confirming ? (
          <Notice title="Подтверждаем оплату…">Обычно это занимает несколько секунд. Страница обновится сама.</Notice>
        ) : status === 'draft' ? (
          <>
            <Button size="lg" className="w-full" loading={pending === 'deposit'} onClick={() => void pay('deposit')}>
              Оплатить предоплату {formatTenge(quote.deposit)}
            </Button>
            <p className="mt-2.5 text-sm leading-relaxed text-muted">
              Анкету можно заполнять уже сейчас. Остаток {formatTenge(quote.balance)} — после согласования макета.
            </p>
          </>
        ) : status === 'awaiting_approval' ? (
          <>
            <Button size="lg" className="w-full" loading={pending === 'balance'} onClick={() => void pay('balance')}>
              Согласовать и оплатить {formatTenge(quote.balance)}
            </Button>
            <p className="mt-2.5 text-sm leading-relaxed text-muted">Если нужны правки, напишите менеджеру — оплату можно внести после.</p>
          </>
        ) : project.paidAmount >= quote.total ? (
          <p className="text-[15px] text-success">Заказ оплачен полностью.</p>
        ) : (
          <p className="text-[15px] text-muted">Предоплата внесена. Остаток понадобится, когда покажем макет.</p>
        )}
        {error && (
          <div className="mt-3">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
