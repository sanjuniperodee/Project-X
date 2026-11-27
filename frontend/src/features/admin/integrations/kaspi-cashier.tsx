'use client';

import { useActionState } from 'react';
import type { KaspiCashierStatus } from '@px/contracts';
import { Button } from '@/shared/ui/button';
import { FieldShell, Input } from '@/shared/ui/form';
import { Notice } from '@/shared/ui/notice';
import { connectKaspi, disconnectKaspi, type KaspiFormState } from './actions';

const initial: KaspiFormState = { step: 'phone', processId: null, error: null, done: false };

/** Kaspi Pay cashier of the studio: status and SMS login (when the session expires, connect it again here). */
export function KaspiCashier({ status }: { status: KaspiCashierStatus }) {
  const [state, action, pending] = useActionState(connectKaspi, initial);

  if (!status.enabled) {
    return <p className="text-muted">Оплата идёт через тестового провайдера: касса Kaspi не используется.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {status.connected ? (
        <Notice tone={status.active === false ? 'danger' : 'success'} title={status.orgName || 'Кассир подключён'}>
          {status.active === false
            ? 'Kaspi больше не принимает эту сессию: счета не выставляются. Подключите кассира заново.'
            : status.active === null
              ? 'Сервис Kaspi сейчас не отвечает — проверьте позже.'
              : `Счета выставляются${status.phone ? ` от кассира ${status.phone}` : ''}.`}
          {status.source === 'env' && ' Сессия задана в настройках сервера — лучше подключить кассира здесь.'}
        </Notice>
      ) : (
        <Notice tone="danger" title="Кассир не подключён">
          Клиенты не смогут оплатить заказ, пока вы не подключите кассира Kaspi Pay.
        </Notice>
      )}

      <form action={action} className="flex max-w-sm flex-col gap-4">
        {state.step === 'phone' ? (
          <FieldShell id="kaspi-phone" label="Телефон кассира Kaspi Pay" hint="На него придёт SMS с кодом" required>
            <Input id="kaspi-phone" name="phone" type="tel" inputMode="tel" placeholder="+7 701 234 56 78" required />
          </FieldShell>
        ) : (
          <FieldShell id="kaspi-otp" label="Код из SMS" required>
            <Input id="kaspi-otp" name="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required autoFocus />
          </FieldShell>
        )}
        {state.error && <Notice tone="danger">{state.error}</Notice>}
        {state.done && <Notice tone="success">Кассир подключён.</Notice>}
        <div className="flex gap-3">
          <Button type="submit" loading={pending}>
            {state.step === 'phone' ? (status.connected ? 'Подключить заново' : 'Получить код') : 'Подключить'}
          </Button>
        </div>
      </form>

      {status.source === 'settings' && (
        <form action={disconnectKaspi}>
          <Button type="submit" variant="secondary">
            Отключить кассира
          </Button>
        </form>
      )}
    </div>
  );
}
